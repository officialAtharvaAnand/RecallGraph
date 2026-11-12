import { performance } from 'node:perf_hooks';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { requireEnv } from './require-env.mjs';

const pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL') });
const driver = neo4j.driver(
  requireEnv('NEO4J_URI'),
  neo4j.auth.basic(requireEnv('NEO4J_USER'), requireEnv('NEO4J_PASSWORD')),
);
try {
  const id = (await pool.query("SELECT id FROM services WHERE name='Identity Gateway'")).rows[0].id;
  const sql =
    'WITH RECURSIVE impacted(service_id,depth,path) AS (' +
    'SELECT service_id,1,ARRAY[depends_on_service_id,service_id] ' +
    'FROM service_dependencies WHERE depends_on_service_id=$1 ' +
    'UNION ALL SELECT edge.service_id,impacted.depth+1,' +
    'impacted.path || edge.service_id FROM service_dependencies edge ' +
    'JOIN impacted ON edge.depends_on_service_id=impacted.service_id ' +
    'WHERE impacted.depth<3 AND NOT edge.service_id=ANY(impacted.path)) ' +
    'SELECT service_id,min(depth) AS depth FROM impacted GROUP BY service_id ORDER BY depth';
  const startSql = performance.now();
  const sqlRows = (await pool.query(sql, [id])).rows;
  const sqlMs = performance.now() - startSql;
  const session = driver.session();
  try {
    const startGraph = performance.now();
    const graphRows = await session.run(
      'MATCH path=(s:Service {id:$id})<-[:DEPENDS_ON*1..3]-(d:Service) ' +
        'RETURN d.id AS id,min(length(path)) AS depth ORDER BY depth',
      { id },
    );
    const graphMs = performance.now() - startGraph;
    console.log('Single local run, including client/network overhead; not a benchmark.');
    console.log('SQL rows: ' + sqlRows.length + '; elapsed ms: ' + sqlMs.toFixed(3));
    console.log('Neo4j rows: ' + graphRows.records.length + '; elapsed ms: ' + graphMs.toFixed(3));
    console.log(
      'Both return the same dependent count: ' +
        String(sqlRows.length === graphRows.records.length),
    );
  } finally {
    await session.close();
  }
} finally {
  await driver.close();
  await pool.end();
}
