import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const base = process.env.TEST_BASE_URL;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let adminCookie;
let analystCookie;
let serviceId;
let categoryId;

async function request(path, method = 'GET', data, cookie = '') {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(data !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
function input(overrides = {}) {
  return {
    title: 'API checkout timeout',
    summary: 'Checkout requests timed out during a test.',
    serviceId,
    severity: 3,
    occurredAt: new Date(Date.now() - 3600000).toISOString(),
    symptoms: [],
    ...overrides,
  };
}
before(async () => {
  serviceId = (
    await pool.query(
      "INSERT INTO services(name,owner_team) VALUES('API Checkout','Test Team') RETURNING id",
    )
  ).rows[0].id;
  categoryId = (
    await pool.query(
      "SELECT id FROM root_cause_categories WHERE label='Connection pool exhaustion'",
    )
  ).rows[0].id;
  const admin = await request('/api/auth', 'POST', {
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  const analyst = await request('/api/auth', 'POST', {
    email: process.env.TEST_ANALYST_EMAIL,
    password: process.env.TEST_ANALYST_PASSWORD,
  });
  assert.equal(admin.status, 200);
  assert.equal(analyst.status, 200);
  adminCookie = admin.cookie;
  analystCookie = analyst.cookie;
});
after(() => pool.end());

test('API rejects unauthenticated incident list with 401', async () => {
  assert.equal((await request('/api/incidents')).status, 401);
});
test('API rejects wrong password with 401', async () => {
  const response = await request('/api/auth', 'POST', {
    email: process.env.TEST_ADMIN_EMAIL,
    password: 'wrong-password',
  });
  assert.equal(response.status, 401);
});
test('API rate limits six bad logins with 429', async () => {
  const email = 'missing-' + randomUUID() + '@example.com';
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal(
      (await request('/api/auth', 'POST', { email, password: 'bad-password' })).status,
      401,
    );
  }
  assert.equal(
    (await request('/api/auth', 'POST', { email, password: 'bad-password' })).status,
    429,
  );
});
test('API returns JSON 400 for severity 9, short title, bad JSON, and bad UUID', async () => {
  for (const result of [
    await request('/api/incidents', 'POST', input({ severity: 9 }), analystCookie),
    await request('/api/incidents', 'POST', input({ title: 'bad' }), analystCookie),
    await request('/api/incidents', 'POST', '{', analystCookie),
    await request('/api/incidents/not-uuid', 'PATCH', { status: 'investigating' }, analystCookie),
  ]) {
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.error, 'string');
  }
});
test('API unknown service is a 4xx JSON error, never 500', async () => {
  const response = await request(
    '/api/incidents',
    'POST',
    input({ serviceId: randomUUID() }),
    analystCookie,
  );
  assert(response.status >= 400 && response.status < 500);
  assert.equal(typeof response.body.error, 'string');
});
test('API analyst is forbidden from delete, admin, reopen, and user routes', async () => {
  const id = randomUUID();
  for (const response of [
    await request('/api/incidents/' + id, 'DELETE', undefined, analystCookie),
    await request('/api/admin', 'GET', undefined, analystCookie),
    await request(
      '/api/incidents/' + id + '/reopen',
      'POST',
      { reason: 'Need another look' },
      analystCookie,
    ),
    await request('/api/admin/users', 'GET', undefined, analystCookie),
  ])
    assert.equal(response.status, 403);
});
test('API admin can create service and list users', async () => {
  const service = await request(
    '/api/admin',
    'POST',
    {
      kind: 'service',
      name: 'API Test Service',
      ownerTeam: 'Test Team',
    },
    adminCookie,
  );
  assert.equal(service.status, 201);
  const users = await request('/api/admin/users', 'GET', undefined, adminCookie);
  assert.equal(users.status, 200);
  assert(users.body.length >= 2);
});
test('API role changes revoke sessions and protect the only admin', async () => {
  const adminId = (
    await pool.query('SELECT id FROM users WHERE email=$1', [process.env.TEST_ADMIN_EMAIL])
  ).rows[0].id;
  const blocked = await request(
    '/api/admin/users/' + adminId,
    'PATCH',
    { role: 'analyst' },
    adminCookie,
  );
  assert.equal(blocked.status, 409);
  const email = 'new-' + randomUUID() + '@example.com';
  const created = await request(
    '/api/admin/users',
    'POST',
    { email, password: 'new-account-password', role: 'analyst' },
    adminCookie,
  );
  assert.equal(created.status, 201);
  const changed = await request(
    '/api/admin/users/' + created.body.id,
    'PATCH',
    { role: 'admin' },
    adminCookie,
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.body.role, 'admin');
  assert.equal(
    (await pool.query('SELECT token_version FROM users WHERE id=$1', [created.body.id])).rows[0]
      .token_version,
    1,
  );
});
test('API incident lifecycle has searchable list, actor audit, and stored resolution', async () => {
  const created = await request('/api/incidents', 'POST', input(), analystCookie);
  assert.equal(created.status, 201);
  const id = created.body.id;
  const list = await request('/api/incidents', 'GET', undefined, analystCookie);
  assert(list.body.items.some((item) => item.id === id));
  const search = await request('/api/incidents?q=checkout', 'GET', undefined, analystCookie);
  assert(search.body.items.some((item) => item.id === id));
  assert.equal(
    (await request('/api/incidents/' + id, 'PATCH', { status: 'investigating' }, analystCookie))
      .status,
    200,
  );
  assert.equal(
    (
      await request(
        '/api/incidents/' + id,
        'PATCH',
        {
          status: 'resolved',
          rootCause: 'Connection pool exhausted',
          categoryId,
        },
        analystCookie,
      )
    ).status,
    200,
  );
  const events = await request('/api/incidents/' + id + '/events', 'GET', undefined, analystCookie);
  assert.equal(events.status, 200);
  assert.deepEqual(
    events.body.map((row) => row.event_type),
    ['created', 'status_changed', 'status_changed', 'root_cause_updated'],
  );
  assert(events.body.every((row) => row.actor_email === process.env.TEST_ANALYST_EMAIL));
  const resolved = (
    await pool.query('SELECT status,root_cause_category_id FROM incidents WHERE id=$1', [id])
  ).rows[0];
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.root_cause_category_id, categoryId);
  const insights = await request('/api/insights', 'GET', undefined, analystCookie);
  assert.equal(insights.status, 200);
  const resolutionRow = insights.body.resolutionStats.find(
    (row) => row.service_name === 'API Checkout',
  );
  assert.equal(typeof resolutionRow?.avg_time_to_resolve_hours, 'number');
  assert(Number.isFinite(resolutionRow.avg_time_to_resolve_hours));
  assert.equal(
    (
      await request(
        '/api/incidents/' + id + '/reopen',
        'POST',
        { reason: 'Follow-up test' },
        adminCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request('/api/incidents/' + id, 'DELETE', undefined, adminCookie)).status,
    200,
  );
});
test('API pagination and filters return consistent totals', async () => {
  for (let index = 0; index < 3; index++) {
    assert.equal(
      (
        await request(
          '/api/incidents',
          'POST',
          input({ title: 'Pagination incident ' + index }),
          analystCookie,
        )
      ).status,
      201,
    );
  }
  const first = await request('/api/incidents?limit=2&offset=0', 'GET', undefined, analystCookie);
  const second = await request('/api/incidents?limit=2&offset=2', 'GET', undefined, analystCookie);
  assert.equal(first.body.items.length, 2);
  assert.equal(first.body.total, second.body.total);
  assert.notEqual(first.body.items[0].id, second.body.items[0].id);
  const filtered = await request(
    '/api/incidents?service=' + serviceId + '&status=open&minSeverity=3&maxSeverity=3',
    'GET',
    undefined,
    analystCookie,
  );
  assert(filtered.body.total >= 3);
  assert(
    filtered.body.items.every(
      (row) => row.service_id === serviceId && row.status === 'open' && row.severity === 3,
    ),
  );
});
