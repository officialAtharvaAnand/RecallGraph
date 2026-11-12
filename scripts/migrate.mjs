import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { requireEnv } from './require-env.mjs';

const pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL') });
const directory = join(process.cwd(), 'db', 'migrations');
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const filename of (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [
        filename,
      ]);
      if (prior.rowCount) {
        await client.query('ROLLBACK');
        console.log(`Already applied: ${filename}`);
        continue;
      }
      await client.query(await readFile(join(directory, filename), 'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${filename} failed: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
