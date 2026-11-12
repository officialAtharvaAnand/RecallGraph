import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTs } from './load-ts.mjs';

const { incidentInput, incidentFilters, updateInput, reopenInput, userInput } =
  loadTs('../lib/validation.ts');
const valid = {
  title: 'A valid incident',
  summary: 'A useful incident summary.',
  serviceId: randomUUID(),
  severity: 1,
  occurredAt: new Date().toISOString(),
  symptoms: [],
};
test('incident schema accepts severity boundaries 1 and 5', () => {
  assert(incidentInput.safeParse(valid).success);
  assert(incidentInput.safeParse({ ...valid, severity: 5 }).success);
});
test('incident schema rejects severity 0, 6 and short title', () => {
  for (const value of [
    { ...valid, severity: 0 },
    { ...valid, severity: 6 },
    { ...valid, title: 'oops' },
  ])
    assert(!incidentInput.safeParse(value).success);
});
test('pagination schema accepts 100 and rejects 101 and negative offset', () => {
  assert(incidentFilters.safeParse({ limit: '100', offset: '0' }).success);
  assert(!incidentFilters.safeParse({ limit: '101' }).success);
  assert(!incidentFilters.safeParse({ offset: '-1' }).success);
});
test('status, resolve and reopen schemas enforce required fields', () => {
  assert(updateInput.safeParse({ status: 'investigating' }).success);
  assert(
    updateInput.safeParse({
      status: 'resolved',
      rootCause: 'Pool exhausted',
      categoryId: randomUUID(),
    }).success,
  );
  assert(!updateInput.safeParse({ status: 'resolved', rootCause: 'why' }).success);
  assert(!reopenInput.safeParse({ reason: 'no' }).success);
});
test('user schema requires 10-character password and normalizes email', () => {
  assert.equal(
    userInput.parse({
      email: 'TEST@EXAMPLE.COM',
      password: 'longpassword',
      role: 'analyst',
    }).email,
    'test@example.com',
  );
  assert(
    !userInput.safeParse({
      email: 'test@example.com',
      password: 'short',
      role: 'analyst',
    }).success,
  );
});
