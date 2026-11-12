import neo4j from 'neo4j-driver';
import { requireEnv } from './require-env.mjs';

const driver = neo4j.driver(
  requireEnv('NEO4J_URI'),
  neo4j.auth.basic(requireEnv('NEO4J_USER'), requireEnv('NEO4J_PASSWORD')),
);
const session = driver.session();
try {
  for (const label of ['Incident', 'Service', 'Symptom', 'RootCause']) {
    await session.run(`CREATE CONSTRAINT ${label.toLowerCase()}_id IF NOT EXISTS
      FOR (node:${label}) REQUIRE node.id IS UNIQUE`);
  }
  await session.run(
    'CREATE INDEX incident_occurred_at IF NOT EXISTS FOR (i:Incident) ON (i.occurredAt)',
  );
  console.log('Graph constraints and indexes ready');
} finally {
  await session.close();
  await driver.close();
}
