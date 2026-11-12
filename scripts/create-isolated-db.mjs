import pg from 'pg';
import { requireEnv } from './require-env.mjs';

const database = process.argv[2];
if (!database || !/^[a-z][a-z0-9_]*$/.test(database)) {
  throw new Error('Pass a safe database name');
}
const url = new URL(requireEnv('DATABASE_URL'));
url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.toString() });
try {
  await client.connect();
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
  if (existing.rowCount) {
    console.log(`Database ${database} already exists`);
  } else {
    await client.query(`CREATE DATABASE "${database}"`);
    console.log(`Created database ${database}`);
  }
} finally {
  await client.end();
}
