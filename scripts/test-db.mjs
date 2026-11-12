import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import pg from 'pg';
import { requireEnv } from './require-env.mjs';

const suite = process.argv[2];
if (!['sql', 'api', 'graph'].includes(suite)) {
  throw new Error('Usage: node scripts/test-db.mjs sql|api|graph');
}
const mainUrl = new URL(requireEnv('DATABASE_URL'));
const mainName = mainUrl.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*$/.test(mainName)) throw new Error('Unsafe database name');
const testName = `${mainName}_test`;
const adminUrl = new URL(mainUrl);
adminUrl.pathname = '/postgres';
const testUrl = new URL(mainUrl);
testUrl.pathname = `/${testName}`;
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const testEnv = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  POSTGRES_DB: testName,
  TEST_ADMIN_EMAIL: 'test-admin@recallgraph.local',
  TEST_ANALYST_EMAIL: 'test-analyst@recallgraph.local',
  TEST_ADMIN_PASSWORD: randomBytes(20).toString('hex'),
  TEST_ANALYST_PASSWORD: randomBytes(20).toString('hex'),
};

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: testEnv,
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} exited with ${result.status}`);
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

let nextServer;
let nextLog = '';
let connected = false;
let createdTestDatabase = false;
try {
  await admin.connect();
  connected = true;
  // Refuse to replace a database that this test run did not create.
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testName]);
  if (existing.rowCount) {
    throw new Error(`Test database ${testName} already exists; inspect and remove it manually`);
  }
  await admin.query(`CREATE DATABASE "${testName}"`);
  createdTestDatabase = true;
  console.log(`Created isolated test database ${testName}`);
  run('scripts/migrate.mjs');
  run('scripts/create-user.mjs', [testEnv.TEST_ADMIN_EMAIL, testEnv.TEST_ADMIN_PASSWORD, 'admin']);
  run('scripts/create-user.mjs', [
    testEnv.TEST_ANALYST_EMAIL,
    testEnv.TEST_ANALYST_PASSWORD,
    'analyst',
  ]);
  if (suite === 'api') {
    const port = await freePort();
    testEnv.TEST_BASE_URL = `http://127.0.0.1:${port}`;
    nextServer = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'],
      { env: testEnv, cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    nextServer.stdout.on('data', (chunk) => {
      nextLog += chunk.toString();
    });
    nextServer.stderr.on('data', (chunk) => {
      nextLog += chunk.toString();
    });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(`${testEnv.TEST_BASE_URL}/api/auth`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* Server still starting. */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`Next test server did not start:\n${nextLog}`);
    console.log(`Next test server ready at ${testEnv.TEST_BASE_URL}`);
  }
  run('--test', [`tests/${suite}.test.mjs`]);
} finally {
  if (nextServer) {
    nextServer.kill();
    await Promise.race([
      once(nextServer, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  if (connected && createdTestDatabase) {
    await admin.query(`DROP DATABASE IF EXISTS "${testName}" WITH (FORCE)`);
    console.log(`Dropped isolated test database ${testName}`);
  }
  await admin.end().catch(() => {});
}
