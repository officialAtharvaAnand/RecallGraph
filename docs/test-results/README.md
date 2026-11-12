# Reproducing the test run

The files in this directory are outputs from commands run against local PostgreSQL
and Neo4j. They are not hand-authored pass reports.

1. Run `setup.ps1` on Windows with Docker Desktop and Node 20 or newer.
2. Run `npm run test:record`. It creates and drops a separate
   `${POSTGRES_DB}_test` database for each integration suite, starts a Next
   test server for API tests, and writes its actual stdout/stderr to `latest.txt`.
3. Run `npm run db:seed:bulk`, then `npm run db:queries` and
   `node --env-file=.env scripts/explain-queries.mjs` to reproduce the
   query and plan outputs. Run `node --env-file=.env scripts/check-seed.mjs`
   for the graph seed checks.

The synthetic seed uses PRNG seed `0x5eed2026` and dates relative to the UTC
day of execution. The results are not production benchmarks. Neo4j totals may
include unrelated local nodes because the instance can be shared.
