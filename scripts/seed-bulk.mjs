/**
 * SYNTHETIC DEMO DATA. Fixed PRNG seed: 0x5eed2026.
 * Dates are relative to the UTC day of execution; runs on the same day are reproducible.
 * --reset deletes only rows recorded by this seed, then creates the dataset again.
 */
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { requireEnv } from './require-env.mjs';
import { drainOutbox } from '../lib/outbox-core.mjs';
import { withTransaction } from '../lib/transaction-core.mjs';

const MARKER = 'recallgraph-bulk-v1';
const pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL') });
const driver = neo4j.driver(
  requireEnv('NEO4J_URI'),
  neo4j.auth.basic(requireEnv('NEO4J_USER'), requireEnv('NEO4J_PASSWORD')),
);
let state = 0x5eed2026;
function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}
function pick(values) {
  return values[Math.floor(random() * values.length)];
}
const day = 86400000;
const base = Math.floor(Date.now() / day) * day;
const services = [
  ['Checkout API', 'Commerce'],
  ['Payments Gateway', 'Payments'],
  ['Identity Gateway', 'Platform'],
  ['Notification Worker', 'Messaging'],
  ['Search Index', 'Discovery'],
  ['Inventory Service', 'Fulfilment'],
  ['Order Orchestrator', 'Commerce'],
  ['Email Provider Adapter', 'Messaging'],
  ['CDN Edge', 'Platform'],
  ['Analytics Pipeline', 'Data'],
];
const symptoms = [
  'Elevated latency',
  'Timeouts',
  'Queue backlog',
  '5xx spike',
  'Authentication errors',
  'Memory growth',
  'CPU saturation',
  'Replication lag',
  'Connection failures',
  'Payment declines',
  'Stale search results',
  'Delayed notifications',
  'Inventory mismatch',
  'DNS failures',
  'Dropped events',
];
const causes = [
  'Connection pool exhaustion',
  'Bad deployment',
  'Dependency outage',
  'Config error',
  'Capacity limit',
  'Data corruption',
  'Network failure',
  'Third-party failure',
];
const edges = [
  ['Checkout API', 'Order Orchestrator'],
  ['Checkout API', 'Identity Gateway'],
  ['Checkout API', 'CDN Edge'],
  ['Order Orchestrator', 'Payments Gateway'],
  ['Order Orchestrator', 'Inventory Service'],
  ['Payments Gateway', 'Identity Gateway'],
  ['Notification Worker', 'Email Provider Adapter'],
  ['Analytics Pipeline', 'Order Orchestrator'],
  ['Search Index', 'Inventory Service'],
];

async function transaction(actorId, fn) {
  return withTransaction(pool, { id: actorId }, fn);
}

async function reset(actorId) {
  await transaction(actorId, async (client) => {
    await client.query(
      `CREATE TEMP TABLE seed_reset_ids ON COMMIT DROP AS
      SELECT id FROM incidents WHERE synthetic_seed=$1`,
      [MARKER],
    );
    await client.query('DELETE FROM incidents WHERE synthetic_seed=$1', [MARKER]);
    // Keep real audit history; remove only the synthetic events just deleted.
    await client.query(`DELETE FROM incident_events WHERE incident_id IN
      (SELECT id FROM seed_reset_ids)`);
    await client.query(`DELETE FROM service_dependencies edge USING synthetic_seed_edges marker
      WHERE edge.service_id=marker.service_id
        AND edge.depends_on_service_id=marker.depends_on_service_id`);
    await client.query('DELETE FROM synthetic_seed_edges');
    for (const table of ['symptoms', 'root_cause_categories', 'services']) {
      await client.query(
        `DELETE FROM ${table} item USING synthetic_seed_rows marker
        WHERE marker.table_name=$1 AND item.id=marker.record_id`,
        [table],
      );
    }
    await client.query('DELETE FROM synthetic_seed_rows');
  });
}

async function catalog(actorId, table, field, value, extra = null) {
  return transaction(actorId, async (client) => {
    const existing = await client.query(`SELECT id FROM ${table} WHERE ${field}=$1`, [value]);
    if (existing.rowCount) return existing.rows[0].id;
    const inserted =
      table === 'services'
        ? await client.query('INSERT INTO services(name,owner_team) VALUES($1,$2) RETURNING id', [
            value,
            extra,
          ])
        : await client.query(`INSERT INTO ${table}(${field}) VALUES($1) RETURNING id`, [value]);
    const id = inserted.rows[0].id;
    await client.query('INSERT INTO synthetic_seed_rows(table_name,record_id) VALUES($1,$2)', [
      table,
      id,
    ]);
    return id;
  });
}

async function seedIncident(actorId, serviceIds, symptomIds, causeIds, pattern, index) {
  const occurredAt = new Date(pattern.when);
  const title = `${pattern.title} #${String(index + 1).padStart(3, '0')}`;
  const status = index % 10 < 6 ? 'resolved' : index % 10 < 8 ? 'investigating' : 'open';
  await transaction(actorId, async (client) => {
    const created = await client.query(
      `INSERT INTO incidents(title,summary,service_id,severity,occurred_at,created_by,synthetic_seed)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        title,
        `[SYNTHETIC RG BULK] ${pattern.summary}`,
        serviceIds.get(pattern.service),
        pattern.severity,
        occurredAt,
        actorId,
        MARKER,
      ],
    );
    const id = created.rows[0].id;
    for (const symptom of pattern.symptoms) {
      await client.query('INSERT INTO incident_symptoms(incident_id,symptom_id) VALUES($1,$2)', [
        id,
        symptomIds.get(symptom),
      ]);
    }
    if (status === 'investigating') {
      await client.query("UPDATE incidents SET status='investigating' WHERE id=$1", [id]);
    } else if (status === 'resolved') {
      await client.query('SELECT resolve_incident($1,$2,$3)', [
        id,
        pattern.rootCause,
        causeIds.get(pattern.category),
      ]);
      const hours = 1 + Math.floor(random() * 12);
      const resolved = new Date(Math.min(Date.now() - 60000, pattern.when + hours * 3600000));
      await client.query('UPDATE incidents SET resolved_at=$2 WHERE id=$1', [id, resolved]);
    }
  });
}

async function printSummary() {
  const counts = await pool.query(
    `SELECT
    (SELECT count(*)::int FROM services) services,
    (SELECT count(*)::int FROM symptoms) symptoms,
    (SELECT count(*)::int FROM root_cause_categories) categories,
    (SELECT count(*)::int FROM incidents WHERE synthetic_seed=$1) synthetic_incidents,
    (SELECT count(*)::int FROM incident_events) audit_events,
    (SELECT count(*)::int FROM graph_outbox WHERE processed_at IS NULL) pending_outbox`,
    [MARKER],
  );
  console.table(counts.rows);
  console.table(
    (
      await pool.query(
        `SELECT status,count(*)::int AS incidents FROM incidents
    WHERE synthetic_seed=$1 GROUP BY status ORDER BY status`,
        [MARKER],
      )
    ).rows,
  );
  console.table(
    (
      await pool.query(
        `SELECT s.name,count(*)::int AS incidents FROM incidents i
    JOIN services s ON s.id=i.service_id WHERE i.synthetic_seed=$1
    GROUP BY s.name ORDER BY s.name`,
        [MARKER],
      )
    ).rows,
  );
  const session = driver.session();
  try {
    const records = await session.run(`MATCH (n) WHERE n:Service OR n:Symptom OR
      n:RootCause OR n:Incident RETURN labels(n)[0] AS label,count(n) AS nodes
      ORDER BY label`);
    console.table(
      records.records.map((record) => ({
        label: record.get('label'),
        nodes: record.get('nodes').toNumber(),
      })),
    );
    const relationships = await session.run(
      'MATCH ()-[r]->() RETURN type(r) AS type,count(r) AS edges ORDER BY type',
    );
    console.table(
      relationships.records.map((record) => ({
        type: record.get('type'),
        edges: record.get('edges').toNumber(),
      })),
    );
    console.log('Neo4j counts include any other data in this shared local instance.');
  } finally {
    await session.close();
  }
}

try {
  const actor = (
    await pool.query("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1")
  ).rows[0];
  if (!actor) throw new Error('Create an admin user before running the bulk seed');
  const existing = (
    await pool.query('SELECT count(*)::int AS n FROM incidents WHERE synthetic_seed=$1', [MARKER])
  ).rows[0].n;
  if (process.argv.includes('--reset')) {
    await reset(actor.id);
    console.log('Removed prior synthetic seed rows only.');
  } else if (existing) {
    console.log(`Synthetic seed already present (${existing} incidents); no rows added.`);
    await printSummary();
    process.exit(0);
  }
  const serviceIds = new Map();
  const symptomIds = new Map();
  const causeIds = new Map();
  for (const [name, team] of services) {
    serviceIds.set(name, await catalog(actor.id, 'services', 'name', name, team));
  }
  for (const name of symptoms) {
    symptomIds.set(name, await catalog(actor.id, 'symptoms', 'label', name));
  }
  for (const name of causes) {
    causeIds.set(name, await catalog(actor.id, 'root_cause_categories', 'label', name));
  }
  for (const [dependent, upstream] of edges) {
    await transaction(actor.id, async (client) => {
      const serviceId = serviceIds.get(dependent);
      const dependsOnServiceId = serviceIds.get(upstream);
      const found = await client.query(
        `SELECT 1 FROM service_dependencies
        WHERE service_id=$1 AND depends_on_service_id=$2`,
        [serviceId, dependsOnServiceId],
      );
      if (!found.rowCount) {
        await client.query(
          `INSERT INTO service_dependencies(service_id,depends_on_service_id)
          VALUES($1,$2)`,
          [serviceId, dependsOnServiceId],
        );
        await client.query(
          `INSERT INTO synthetic_seed_edges(service_id,depends_on_service_id)
          VALUES($1,$2)`,
          [serviceId, dependsOnServiceId],
        );
      }
    });
  }
  const patterns = [];
  for (let index = 0; index < 50; index++) {
    patterns.push({
      title: 'Checkout connection pool saturation',
      service: 'Checkout API',
      summary: 'Requests slowed and timed out as the database connection pool filled.',
      symptoms: ['Elevated latency', 'Timeouts', 'Connection failures'],
      rootCause: 'Connection pool exhaustion during a traffic spike.',
      category: 'Connection pool exhaustion',
      severity: 3 + (index % 2),
      when: base - (170 - index * 3) * day + 9 * 3600000,
    });
  }
  for (let index = 0; index < 15; index++) {
    const when = base - (150 - index * 9) * day + 10 * 3600000;
    patterns.push({
      title: 'Identity token validation outage',
      service: 'Identity Gateway',
      summary: 'Authentication token validation failed for dependent services.',
      symptoms: ['Authentication errors', '5xx spike'],
      rootCause: 'Identity Gateway dependency outage.',
      category: 'Dependency outage',
      severity: 4,
      when,
    });
    patterns.push({
      title: 'Checkout authentication failures',
      service: 'Checkout API',
      summary: 'Checkout requests failed authentication after upstream identity errors.',
      symptoms: ['Authentication errors', '5xx spike', 'Timeouts'],
      rootCause: 'Upstream Identity Gateway outage.',
      category: 'Dependency outage',
      severity: 4,
      when: when + 2 * 3600000,
    });
  }
  for (let index = 0; index < 40; index++) {
    patterns.push({
      title: 'Release triggered server errors',
      service: pick(['Order Orchestrator', 'Payments Gateway', 'Inventory Service']),
      summary: 'A recent deployment caused a sustained rise in server errors.',
      symptoms: ['5xx spike', 'Elevated latency', 'CPU saturation'],
      rootCause: 'Bad deployment introduced a request-handling regression.',
      category: 'Bad deployment',
      severity: 2 + (index % 3),
      when: base - (155 - index * 3) * day + 11 * 3600000,
    });
  }
  const other = [
    ['Notification Worker', 'Queue backlog', 'Capacity limit'],
    ['Search Index', 'Stale search results', 'Data corruption'],
    ['Inventory Service', 'Inventory mismatch', 'Config error'],
    ['Email Provider Adapter', 'Delayed notifications', 'Third-party failure'],
    ['CDN Edge', 'DNS failures', 'Network failure'],
    ['Analytics Pipeline', 'Dropped events', 'Capacity limit'],
  ];
  for (let index = 0; index < 60; index++) {
    const [service, symptom, category] = other[index % other.length];
    patterns.push({
      title: `${service} degraded`,
      service,
      summary: `${symptom} appeared during an operational failure at ${service}.`,
      symptoms: [
        symptom,
        pick([
          'Elevated latency',
          'Timeouts',
          'Memory growth',
          'Replication lag',
          'Payment declines',
        ]),
      ],
      rootCause: `${category} disrupted ${service.toLowerCase()}.`,
      category,
      severity: 1 + (index % 5),
      when: base - (179 - index * 3) * day + 8 * 3600000,
    });
  }
  for (let index = 0; index < patterns.length; index++) {
    await seedIncident(actor.id, serviceIds, symptomIds, causeIds, patterns[index], index);
  }
  console.log(`Inserted ${patterns.length} SYNTHETIC incidents (PRNG seed 0x5eed2026).`);
  let totalProcessed = 0;
  while (true) {
    const result = await drainOutbox(pool, driver, 100);
    totalProcessed += result.processed;
    if (result.pending === 0 || result.processed === 0) {
      console.log(
        `Outbox processed: ${totalProcessed}; pending: ${result.pending}; failed: ${result.failed}`,
      );
      break;
    }
  }
  await printSummary();
} finally {
  await driver.close();
  await pool.end();
}
