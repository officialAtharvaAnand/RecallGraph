import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { drainOutbox } from '../lib/outbox-core.mjs';
import { loadTs } from './load-ts.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
);
let available = false;
let unavailableReason = '';
let actor;
let service;
let symptom;
let category;
let projectedIncidentId;
const fixtureIds = [];

async function graphQuery(query, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(query, params);
    return result.records.map((record) =>
      Object.fromEntries(
        record.keys.map((key) => {
          const value = record.get(key);
          return [key, neo4j.isInt(value) ? value.toNumber() : value];
        }),
      ),
    );
  } finally {
    await session.close();
  }
}
const graph = loadTs('../lib/graph.ts', { './db': { graphQuery } });

before(async () => {
  try {
    await driver.verifyConnectivity();
    available = true;
    const cleanup = driver.session();
    try {
      // Remove fixtures left by an interrupted earlier run, never application nodes.
      await cleanup.run(
        "MATCH (n) WHERE n.name='Graph Test Service' OR " +
          "n.label='Graph test timeout' OR n.title='Graph test incident' " +
          'DETACH DELETE n',
      );
    } finally {
      await cleanup.close();
    }
  } catch (error) {
    unavailableReason = 'Neo4j unavailable: ' + error.message;
  }
  actor = (await pool.query('SELECT id FROM users WHERE email=$1', [process.env.TEST_ADMIN_EMAIL]))
    .rows[0].id;
  service = (
    await pool.query(
      "INSERT INTO services(name,owner_team) VALUES('Graph Test Service','Test Team') RETURNING id",
    )
  ).rows[0].id;
  symptom = (
    await pool.query("INSERT INTO symptoms(label) VALUES('Graph test timeout') RETURNING id")
  ).rows[0].id;
  fixtureIds.push(service, symptom);
  category = (
    await pool.query(
      "SELECT id FROM root_cause_categories WHERE label='Connection pool exhaustion'",
    )
  ).rows[0].id;
});
after(async () => {
  if (available) {
    const session = driver.session();
    try {
      await session.run('MATCH (n:RecallGraphTest) DETACH DELETE n');
      for (const id of fixtureIds) {
        await session.run('MATCH (n {id:$id}) DETACH DELETE n', { id });
      }
    } finally {
      await session.close();
    }
  }
  await driver.close();
  await pool.end();
});

test('graph outbox row is written in the incident transaction', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = (
      await client.query(
        'INSERT INTO incidents(title,summary,service_id,severity,occurred_at,created_by) ' +
          "VALUES('Graph test incident','A graph projection test incident',$1,3,now(),$2) RETURNING id",
        [service, actor],
      )
    ).rows[0].id;
    const outbox = await client.query(
      "SELECT 1 FROM graph_outbox WHERE op='upsert_incident' AND payload->>'id'=$1",
      [id],
    );
    assert.equal(outbox.rowCount, 1);
    await client.query('COMMIT');
    projectedIncidentId = id;
    fixtureIds.push(id);
  } finally {
    client.release();
  }
});

test('graph drain projects incident and repeated drain is idempotent', async (t) => {
  if (!available) return t.skip(unavailableReason);
  let result;
  do {
    result = await drainOutbox(pool, driver, 100);
  } while (result.pending > 0 && result.processed > 0);
  assert.equal(result.pending, 0);
  const session = driver.session();
  try {
    const count = await session.run('MATCH (i:Incident {id:$id}) RETURN count(i) AS n', {
      id: projectedIncidentId,
    });
    assert.equal(count.records[0].get('n').toNumber(), 1);
    await session.run('MATCH (i:Incident {id:$id}) SET i:RecallGraphTest', {
      id: projectedIncidentId,
    });
  } finally {
    await session.close();
  }
  const second = await drainOutbox(pool, driver, 100);
  assert.equal(second.processed, 0);
  assert.equal(second.pending, 0);
});

test('graph outage leaves an outbox row pending with last_error and no throw', async (t) => {
  if (!available) return t.skip(unavailableReason);
  await pool.query(
    "UPDATE incidents SET summary='Changed while graph is unavailable' WHERE id=$1",
    [projectedIncidentId],
  );
  const bad = neo4j.driver('bolt://127.0.0.1:1', neo4j.auth.basic('missing', 'missing'), {
    connectionTimeout: 1000,
    maxTransactionRetryTime: 1000,
  });
  try {
    const result = await drainOutbox(pool, bad, 1);
    assert.equal(result.processed, 0);
    assert(result.pending > 0);
    const row = (
      await pool.query(
        'SELECT attempts,last_error FROM graph_outbox WHERE processed_at IS NULL ORDER BY id LIMIT 1',
      )
    ).rows[0];
    assert(row.attempts > 0 && row.last_error);
  } finally {
    await bad.close();
  }
  let result;
  do {
    result = await drainOutbox(pool, driver, 100);
  } while (result.pending > 0 && result.processed > 0);
  assert.equal(result.pending, 0);
});

test('graph functions return expected blast radius, root cause, and upstream answers', async (t) => {
  if (!available) return t.skip(unavailableReason);
  const [upstream, dependent, target, older, cause, shared] = Array.from({ length: 6 }, () =>
    randomUUID(),
  );
  fixtureIds.push(upstream, dependent, target, older, cause, shared);
  const session = driver.session();
  try {
    await session.run(
      "CREATE (u:Service:RecallGraphTest {id:$upstream,name:'Upstream'})" +
        "-[:DEPENDS_ON]->(dummy:Service:RecallGraphTest {id:$dummy,name:'Dummy'}) " +
        "CREATE (d:Service:RecallGraphTest {id:$dependent,name:'Dependent'})" +
        '-[:DEPENDS_ON]->(u) ' +
        "CREATE (s:Symptom:RecallGraphTest {id:$shared,label:'Timeouts'}) " +
        "CREATE (c:RootCause:RecallGraphTest {id:$cause,label:'Pool exhaustion'}) " +
        "CREATE (a:Incident:RecallGraphTest {id:$target,title:'Target',occurredAt:$now})" +
        '-[:AFFECTS]->(d) CREATE (a)-[:EXHIBITS]->(s) ' +
        "CREATE (b:Incident:RecallGraphTest {id:$older,title:'Older',occurredAt:$earlier})" +
        '-[:AFFECTS]->(u) CREATE (b)-[:EXHIBITS]->(s) CREATE (b)-[:CAUSED_BY]->(c)',
      {
        upstream,
        dummy: randomUUID(),
        dependent,
        shared,
        cause,
        target,
        older,
        now: Date.now() - 3600000,
        earlier: Date.now() - 7200000,
      },
    );
    assert((await graph.blastRadius(upstream)).some((row) => row.id === dependent));
    assert((await graph.likelyRootCauses(target)).some((row) => row.id === cause));
    assert((await graph.upstreamSuspects(target)).some((row) => row.id === older));
  } finally {
    await session.close();
  }
});
