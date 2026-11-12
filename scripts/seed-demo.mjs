import pg from 'pg';
import { requireEnv } from './require-env.mjs';

const pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL') });
const examples = [
  [
    'Checkout latency during promotion',
    'Connection pool saturation raised checkout latency during a promotion.',
  ],
  [
    'Repeat checkout timeout pattern',
    'Checkout requests timed out when the same connection pool reached capacity.',
  ],
];
try {
  const user = (await pool.query("SELECT id FROM users WHERE email='analyst@recallgraph.local'"))
    .rows[0];
  const service = (await pool.query("SELECT id FROM services WHERE name='Checkout API'")).rows[0];
  const symptom = (await pool.query("SELECT id FROM symptoms WHERE label='Elevated latency'"))
    .rows[0];
  if (!user || !service || !symptom) throw new Error('Create users and run migrations first');
  for (const [title, summary] of examples) {
    let incident = (await pool.query('SELECT id FROM incidents WHERE title=$1 LIMIT 1', [title]))
      .rows[0];
    if (!incident) {
      incident = (
        await pool.query(
          `INSERT INTO incidents(title,summary,service_id,severity,occurred_at,created_by)
         VALUES($1,$2,$3,3,now(),$4) RETURNING id`,
          [title, summary, service.id, user.id],
        )
      ).rows[0];
    }
    await pool.query(
      `INSERT INTO incident_symptoms(incident_id,symptom_id)
      VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [incident.id, symptom.id],
    );
  }
  console.log('Demo incidents ready; graph changes are queued in the outbox');
} finally {
  await pool.end();
}
