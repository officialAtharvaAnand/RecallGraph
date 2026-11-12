import pg from 'pg';
import neo4j from 'neo4j-driver';
import { requireEnv } from './require-env.mjs';

const wipe = process.argv.includes('--wipe');
if (wipe && !process.argv.includes('--confirm-wipe')) {
  throw new Error(
    'Graph wipe requires --confirm-wipe; verify NEO4J_URI targets a dedicated database',
  );
}

const pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL') });
const driver = neo4j.driver(
  requireEnv('NEO4J_URI'),
  neo4j.auth.basic(requireEnv('NEO4J_USER'), requireEnv('NEO4J_PASSWORD')),
);
const session = driver.session();

async function batches(rows, query) {
  for (let offset = 0; offset < rows.length; offset += 100) {
    await session.executeWrite((tx) => tx.run(query, { rows: rows.slice(offset, offset + 100) }));
  }
}

try {
  if (wipe) {
    await session.run('MATCH (node) DETACH DELETE node');
  }
  const services = (await pool.query('SELECT id,name FROM services')).rows;
  const symptoms = (await pool.query('SELECT id,label FROM symptoms')).rows;
  const causes = (await pool.query('SELECT id,label FROM root_cause_categories')).rows;
  const dependencies = (
    await pool.query('SELECT service_id,depends_on_service_id FROM service_dependencies')
  ).rows;
  const incidents = (
    await pool.query(`SELECT id,title,severity,status,occurred_at,service_id,
    root_cause_category_id FROM incidents`)
  ).rows.map((row) => ({
    ...row,
    occurredAt: new Date(row.occurred_at).getTime(),
  }));
  const links = (await pool.query('SELECT incident_id,symptom_id FROM incident_symptoms')).rows;

  if (!wipe) {
    // Replace only RecallGraph's derived edges and prune deleted source rows.
    await session.run('MATCH ()-[r:DEPENDS_ON|AFFECTS|EXHIBITS|CAUSED_BY]->() DELETE r');
    for (const [label, rows] of [
      ['Service', services],
      ['Symptom', symptoms],
      ['RootCause', causes],
      ['Incident', incidents],
    ]) {
      await session.run(`MATCH (node:${label}) WHERE NOT node.id IN $ids DETACH DELETE node`, {
        ids: rows.map((row) => row.id),
      });
    }
  }

  await batches(services, 'UNWIND $rows AS row MERGE (s:Service {id:row.id}) SET s.name=row.name');
  await batches(
    symptoms,
    'UNWIND $rows AS row MERGE (s:Symptom {id:row.id}) SET s.label=row.label',
  );
  await batches(
    causes,
    'UNWIND $rows AS row MERGE (r:RootCause {id:row.id}) SET r.label=row.label',
  );
  await batches(
    dependencies,
    `UNWIND $rows AS row
    MATCH (s:Service {id:row.service_id}),(upstream:Service {id:row.depends_on_service_id})
    MERGE (s)-[:DEPENDS_ON]->(upstream)`,
  );
  await batches(
    incidents,
    `UNWIND $rows AS row
    MERGE (i:Incident {id:row.id}) SET i.title=row.title,i.severity=row.severity,
      i.occurredAt=row.occurredAt
    WITH i,row MATCH (service:Service {id:row.service_id})
    MERGE (i)-[:AFFECTS]->(service)`,
  );
  await batches(
    incidents.filter((row) => row.status === 'resolved' && row.root_cause_category_id),
    `UNWIND $rows AS row
    MATCH (i:Incident {id:row.id}),(r:RootCause {id:row.root_cause_category_id})
    MERGE (i)-[:CAUSED_BY]->(r)`,
  );
  await batches(
    links,
    `UNWIND $rows AS row
    MATCH (i:Incident {id:row.incident_id}),(s:Symptom {id:row.symptom_id})
    MERGE (i)-[:EXHIBITS]->(s)`,
  );

  for (const [label, expected] of [
    ['Service', services.length],
    ['Symptom', symptoms.length],
    ['RootCause', causes.length],
    ['Incident', incidents.length],
  ]) {
    const found = (await session.run(`MATCH (n:${label}) RETURN count(n) AS count`)).records[0]
      .get('count')
      .toNumber();
    console.log(`${label} nodes: PostgreSQL ${expected}, Neo4j ${found}`);
  }
  for (const [relationship, expected] of [
    ['DEPENDS_ON', dependencies.length],
    ['AFFECTS', incidents.length],
    ['EXHIBITS', links.length],
    [
      'CAUSED_BY',
      incidents.filter((row) => row.status === 'resolved' && row.root_cause_category_id).length,
    ],
  ]) {
    const found = (
      await session.run(`MATCH ()-[r:${relationship}]->() RETURN count(r) AS count`)
    ).records[0]
      .get('count')
      .toNumber();
    console.log(`${relationship} edges: PostgreSQL ${expected}, Neo4j ${found}`);
  }
} finally {
  await session.close();
  await driver.close();
  await pool.end();
}
