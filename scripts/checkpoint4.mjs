import assert from 'node:assert/strict';
import pg from 'pg';
import { requireEnv } from './require-env.mjs';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:3100';
const pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL') });
const results = [];

async function request(path, method = 'GET', data, cookie = '') {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(data !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data),
  });
  const body = await response.json();
  return { status: response.status, body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

try {
  const admin = await request('/api/auth', 'POST', {
    email: 'admin@recallgraph.local', password: requireEnv('TEST_ADMIN_PASSWORD'),
  });
  const analyst = await request('/api/auth', 'POST', {
    email: 'analyst@recallgraph.local', password: requireEnv('TEST_ANALYST_PASSWORD'),
  });
  assert.equal(admin.status, 200);
  assert.equal(analyst.status, 200);
  const adminCookie = admin.cookie;
  const analystCookie = analyst.cookie;
  const service = (await pool.query('SELECT id,name FROM services ORDER BY name LIMIT 1')).rows[0];
  const category = (await pool.query(
    "SELECT id FROM root_cause_categories WHERE label='Connection pool exhaustion'",
  )).rows[0];
  const incident = {
    title: 'Checkpoint API incident',
    summary: 'A synthetic incident for API acceptance checks.',
    serviceId: service.id,
    severity: 3,
    occurredAt: new Date(Date.now() - 3600000).toISOString(),
    symptoms: [],
  };
  async function check(name, actual, expected) {
    assert.equal(actual, expected, name);
    results.push(`${name}: HTTP ${actual}`);
  }
  await check('Unknown service', (await request('/api/incidents', 'POST', {
    ...incident, serviceId: crypto.randomUUID(),
  }, analystCookie)).status, 409);
  await check('Malformed URL UUID', (await request('/api/incidents/not-a-uuid', 'PATCH',
    { status: 'investigating' }, analystCookie)).status, 400);
  await check('Malformed JSON', (await request('/api/incidents', 'POST', '{',
    analystCookie)).status, 400);
  await check('Severity 9', (await request('/api/incidents', 'POST', {
    ...incident, severity: 9,
  }, analystCookie)).status, 400);
  await check('Duplicate service', (await request('/api/admin', 'POST', {
    kind: 'service', name: service.name, ownerTeam: 'Checkpoint team',
  }, adminCookie)).status, 409);
  await check('Analyst admin route', (await request('/api/admin', 'GET', undefined,
    analystCookie)).status, 403);
  await check('Unauthenticated admin route', (await request('/api/admin')).status, 401);
  const created = await request('/api/incidents', 'POST', incident, analystCookie);
  await check('Create incident', created.status, 201);
  const id = created.body.id;
  await check('Investigate', (await request(`/api/incidents/${id}`, 'PATCH',
    { status: 'investigating' }, analystCookie)).status, 200);
  await check('Resolve', (await request(`/api/incidents/${id}`, 'PATCH',
    { status: 'resolved', rootCause: 'Connection pool exhaustion', categoryId: category.id },
    analystCookie)).status, 200);
  const events = await pool.query(
    `SELECT e.event_type,u.email FROM incident_events e
     LEFT JOIN users u ON u.id=e.actor_id WHERE e.incident_id=$1 ORDER BY e.id`,
    [id],
  );
  assert.deepEqual(events.rows.map((row) => row.event_type),
    ['created', 'status_changed', 'status_changed', 'root_cause_updated']);
  assert(events.rows.every((row) => row.email === 'analyst@recallgraph.local'));
  results.push('Audit actor: analyst on created, status changes, and root cause update');
  const resolved = await pool.query('SELECT status,root_cause_category_id FROM incidents WHERE id=$1', [id]);
  assert.equal(resolved.rows[0].status, 'resolved');
  assert.equal(resolved.rows[0].root_cause_category_id, category.id);
  results.push('Stored resolution: category and state persisted via API function path');
  console.log(results.join('\n'));
} finally {
  await pool.end();
}
