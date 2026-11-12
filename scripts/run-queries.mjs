import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { requireEnv } from './require-env.mjs';

const client = new pg.Client({ connectionString: requireEnv('DATABASE_URL') });
try {
  await client.connect();
  const results = await client.query(await readFile('db/queries.sql', 'utf8'));
  for (const [index, result] of results.entries()) {
    console.log(`Statement ${index + 1}: ${result.command}`);
    if (result.rows?.length) console.log(JSON.stringify(result.rows, null, 2));
  }
} finally {
  await client.end();
}
