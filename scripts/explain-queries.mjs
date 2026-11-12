import pg from 'pg';
import { requireEnv } from './require-env.mjs';

const client = new pg.Client({ connectionString: requireEnv('DATABASE_URL') });
const examples = [
  {
    name: 'FTS query',
    index: 'incidents_search_vector_idx',
    sql: `SELECT id FROM incidents
      WHERE search_vector @@ plainto_tsquery('english','connection pool')`,
  },
  {
    name: 'Service plus time filter',
    index: 'incidents_service_time_idx',
    sql: `SELECT id FROM incidents WHERE service_id =
      (SELECT id FROM services WHERE name='Checkout API')
      AND occurred_at > now()-interval '90 days'`,
  },
  {
    name: 'Status plus severity filter',
    index: 'incidents_status_severity_idx',
    sql: `SELECT id FROM incidents WHERE status='investigating' AND severity>=4`,
  },
];
try {
  await client.connect();
  for (const example of examples) {
    console.log(`\n=== ${example.name}: natural planner ===`);
    const natural = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${example.sql}`);
    console.log(natural.rows.map((row) => row['QUERY PLAN']).join('\n'));
    await client.query('BEGIN');
    try {
      // At 180 rows a sequential scan can be cheaper. Force it off only to
      // demonstrate the access path; this is not a production speed claim.
      await client.query('SET LOCAL enable_seqscan=off');
      console.log(`\n=== ${example.name}: index available, forced comparison ===`);
      const indexed = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${example.sql}`);
      console.log(indexed.rows.map((row) => row['QUERY PLAN']).join('\n'));
      await client.query(`DROP INDEX ${example.index}`);
      console.log(`\n=== ${example.name}: index dropped in rollback transaction ===`);
      const dropped = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${example.sql}`);
      console.log(dropped.rows.map((row) => row['QUERY PLAN']).join('\n'));
    } finally {
      await client.query('ROLLBACK');
    }
  }
  console.log('\nAll index drops rolled back. Forced plans demonstrate access paths only.');
} finally {
  await client.end();
}
