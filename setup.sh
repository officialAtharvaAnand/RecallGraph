#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

for command in docker node npm; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }
done
docker info >/dev/null 2>&1 || { echo 'Start Docker Desktop or another Docker daemon first.' >&2; exit 1; }
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || {
  echo 'Node.js 20 or newer is required.' >&2
  exit 1
}
if [[ -e .env ]]; then
  echo '.env already exists. Use ./start.sh, or follow README manual setup to resume an interrupted setup.' >&2
  exit 1
fi

umask 077
node <<'NODE' > .env
const { randomBytes } = require('node:crypto');
const hex = (n) => randomBytes(n).toString('hex');
const postgresPassword = hex(24);
const neo4jPassword = hex(24);
const postgresPort = process.env.POSTGRES_PORT || '5432';
const neo4jHttpPort = process.env.NEO4J_HTTP_PORT || '7474';
const neo4jBoltPort = process.env.NEO4J_BOLT_PORT || '7687';
const config = {
  POSTGRES_DB: 'recallgraph',
  POSTGRES_USER: 'recallgraph',
  POSTGRES_PASSWORD: postgresPassword,
  POSTGRES_PORT: postgresPort,
  DATABASE_URL: `postgresql://recallgraph:${postgresPassword}@127.0.0.1:${postgresPort}/recallgraph`,
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: neo4jPassword,
  NEO4J_HTTP_PORT: neo4jHttpPort,
  NEO4J_BOLT_PORT: neo4jBoltPort,
  NEO4J_URI: `bolt://127.0.0.1:${neo4jBoltPort}`,
  JWT_SECRET: hex(32),
  COMPOSE_PROJECT_NAME: `recallgraph_${hex(4)}`,
};
for (const [key, value] of Object.entries(config)) console.log(`${key}=${value}`);
NODE

docker compose up -d --wait
npm ci
npm run db:migrate
node --env-file=.env scripts/init-graph.mjs
admin_password="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))')"
analyst_password="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))')"
node --env-file=.env scripts/create-user.mjs admin@recallgraph.local "$admin_password" admin
node --env-file=.env scripts/create-user.mjs analyst@recallgraph.local "$analyst_password" analyst
node --env-file=.env scripts/seed-demo.mjs
node --env-file=.env scripts/resync-graph.mjs

printf '\nSetup complete. Save these generated demo credentials now:\n'
printf 'Admin: admin@recallgraph.local / %s\n' "$admin_password"
printf 'Analyst: analyst@recallgraph.local / %s\n' "$analyst_password"
printf 'Run ./start.sh and open http://localhost:3000/\n'
