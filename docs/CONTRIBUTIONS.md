# Contribution plan and evidence

This is a proposed division of work. It is **not** a claim about who has written the current files. Both students need real database and application contributions, genuine commits under their own identities, and the ability to explain both sides.

| Member   | Identity                           | Proposed database work                                                                                                                | Proposed application work                                                                |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Member A | Atharva Ashish Vyas, PES1UG24CS093 | PostgreSQL migrations, constraints, triggers, stored functions, views, indexes/EXPLAIN, seed data, SQL tests, SQL sections of report. | Incident/auth Route Handlers, Zod schemas, error mapping, actor transactions, API tests. |
| Member B | Atharva Anand, PES1UG24CS092       | Neo4j model, Cypher traversals, outbox worker/resync, scoring, graph tests, graph sections of report.                                 | Dashboard, incident drawer, admin and user panels, responsive UI, UI checks.             |

Shared review: API hardening, integration tests, documentation, security audit, and live demonstration. The actual split can differ; record what each member really implemented and reviewed.

## Work packages and branches

| Package                        | Suggested owner | Paths                                                                        | Suggested branch       |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------- | ---------------------- |
| SQL model and integrity        | A               | db/migrations/, db/queries.sql, scripts/migrate.mjs                          | feature/sql-migrations |
| SQL seed and plans             | A               | scripts/seed-bulk.mjs, scripts/explain-queries.mjs, tests/sql.test.mjs       | feature/sql-evidence   |
| Incident/auth API              | A               | app/api/incidents/, app/api/auth/, lib/auth.ts, lib/validation.ts            | feature/incident-api   |
| Graph model and traversal      | B               | lib/graph.ts, scripts/init-graph.mjs, scripts/resync-graph.mjs               | feature/graph-model    |
| Outbox and graph tests         | B               | lib/outbox-core.mjs, lib/outbox.ts, tests/graph.test.mjs                     | feature/outbox         |
| Dashboard and investigation UI | B               | components/Dashboard.tsx, IncidentDrawer.tsx, IncidentList.tsx, app/page.tsx | feature/ui-dashboard   |
| Admin UI and API               | Shared          | app/api/admin/, components/AdminPanel.tsx, UsersPanel.tsx                    | feature/admin          |
| Documentation and review       | Shared          | docs/, README.md, tests/api.test.mjs                                         | docs/final-report      |

Suggested commit messages: <code>feat(sql): add resolution integrity</code>, <code>feat(graph): trace upstream failures</code>, <code>fix(api): map constraint errors</code>, <code>test: cover outbox retry</code>, and <code>docs: explain schema</code>. Each member should configure their **own** Git identity on their machine and commit their actual work in small, reviewable changes. Do not backfill history or attribute another person's work to yourself.

## Real contribution record

| Member              | Real commit count          | Database files changed     | Application files changed  | Reviews/PRs              |
| ------------------- | -------------------------- | -------------------------- | -------------------------- | ------------------------ |
| Atharva Ashish Vyas | [TEAM TO FILL: real count] | [TEAM TO FILL: real paths] | [TEAM TO FILL: real paths] | [TEAM TO FILL: real PRs] |
| Atharva Anand       | [TEAM TO FILL: real count] | [TEAM TO FILL: real paths] | [TEAM TO FILL: real paths] | [TEAM TO FILL: real PRs] |

## Originality checklist

- [ ] [TEAM TO FILL: confirm neither member copied a tutorial, repository, or another team's implementation.]
- [ ] [TEAM TO FILL: list any external ideas or references actually used.]
- [ ] [TEAM TO FILL: each member has read and can explain every file they claim.]
- [ ] [TEAM TO FILL: each member can explain the SQL schema, triggers, outbox, Cypher, scoring, and auth flow.]
- [ ] [TEAM TO FILL: check the course policy on AI-assisted work and disclose use as required.]
- [ ] [TEAM TO FILL: confirm the title is unique in the section and the instructor approved the team/topic.]
