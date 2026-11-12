import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { requireEnv } from './require-env.mjs';

const driver = neo4j.driver(
  requireEnv('NEO4J_URI'),
  neo4j.auth.basic(requireEnv('NEO4J_USER'), requireEnv('NEO4J_PASSWORD')),
);
const session = driver.session();
try {
  const checks = [
    [
      'Blast radius',
      `MATCH (:Service {name:'Identity Gateway'})<-[:DEPENDS_ON*1..3]-(d:Service)
      RETURN count(DISTINCT d) AS n`,
    ],
    [
      'Likely root causes',
      `MATCH (target:Incident)-[:EXHIBITS]->(:Symptom)
      <-[:EXHIBITS]-(other:Incident)-[:CAUSED_BY]->(:RootCause)
      WHERE target.title STARTS WITH 'Checkout connection pool saturation'
      AND target.id <> other.id RETURN count(DISTINCT other) AS n`,
    ],
    [
      'Upstream suspects',
      `MATCH (target:Incident)-[:AFFECTS]->(service:Service)
      MATCH (service)-[:DEPENDS_ON*1..3]->(upstream:Service)
      MATCH (other:Incident)-[:AFFECTS]->(upstream)
      WHERE target.title STARTS WITH 'Checkout authentication failures'
      AND other.occurredAt <= target.occurredAt
      AND other.occurredAt >= target.occurredAt-21600000
      RETURN count(DISTINCT other) AS n`,
    ],
    [
      'Symptom co-occurrence',
      `MATCH (a:Symptom)<-[:EXHIBITS]-(i:Incident)
      -[:EXHIBITS]->(b:Symptom) WHERE a.id < b.id
      RETURN count(DISTINCT i) AS n`,
    ],
  ];
  for (const [name, query] of checks) {
    const result = await session.run(query);
    const n = result.records[0].get('n').toNumber();
    assert(n > 0, `${name} should be nonempty`);
    console.log(`${name}: ${n} supporting graph matches`);
  }
} finally {
  await session.close();
  await driver.close();
}
