import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/scoring.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { scoreMatch, MATCH_WEIGHTS } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('explains and caps a strong match', () => {
  const result = scoreMatch({
    sharedLabels: ['Latency', 'Timeouts'],
    sameService: true,
    serviceName: 'Checkout',
    severityGap: 0,
    occurredAt: new Date().toISOString(),
  });
  assert.equal(result.score, 100);
  assert.equal(result.reasons.length, 5);
  assert.equal(MATCH_WEIGHTS.sharedSymptom, 35);
});

test('distant unrelated incident scores zero', () => {
  const result = scoreMatch({
    sharedLabels: [],
    sameService: false,
    serviceName: 'Checkout',
    severityGap: 3,
    occurredAt: '2020-01-01T00:00:00Z',
  });
  assert.equal(result.score, 0);
  assert.deepEqual(result.reasons, []);
});
