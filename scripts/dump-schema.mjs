import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { requireEnv } from './require-env.mjs';

const user = requireEnv('POSTGRES_USER');
const database = requireEnv('POSTGRES_DB');
const output = execFileSync(
  'docker',
  ['compose', 'exec', '-T', 'postgres', 'pg_dump', '--schema-only', '-U', user, '-d', database],
  { encoding: 'utf8' },
);
writeFileSync('db/schema.snapshot.sql', output);
console.log('Wrote db/schema.snapshot.sql');
