# Contribution plan and evidence

Atharva Anand reports that he and Atharva Ashish Vyas worked together and that their instructor approved the team. The table below defines presentation and follow-up responsibilities; it is **not** an attribution of the imported source files. The 12 November 2026 UI fix, macOS setup, and evidence update were prepared with Codex assistance under Atharva Anand's account. Both students should be able to explain the database and application, and future work should be committed under each student's own identity.

| Member   | Identity                           | Database responsibility                                                                                                                | Application responsibility                                                                |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Member A | Atharva Ashish Vyas, PES1UG24CS093 | PostgreSQL migrations, constraints, triggers, stored functions, views, indexes/EXPLAIN, seed data, SQL tests, SQL sections of report. | Incident/auth Route Handlers, Zod schemas, error mapping, actor transactions, API tests. |
| Member B | Atharva Anand, PES1UG24CS092       | Neo4j model, Cypher traversals, outbox worker/resync, scoring, graph tests, graph sections of report.                                 | Dashboard, incident drawer, admin and user panels, responsive UI, UI checks.             |

Shared review: API hardening, integration tests, documentation, security audit, and live demonstration. Record the actual implementation and review split as evidence becomes available; the project archive had no Git history.

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

| Member              | Authenticated repository evidence | Database files changed | Application files changed | Reviews/PRs |
| ------------------- | -------------------------- | -------------------------- | -------------------------- | ------------------------ |
| Atharva Ashish Vyas | Invited as a write-access collaborator; acceptance and commits pending | Joint work reported, individual paths unverified | Joint work reported, individual paths unverified | Pending |
| Atharva Anand | Initial ZIP import under his Git identity; later verification changes committed separately | Joint work reported, individual paths unverified | Verified UI filter repair and macOS setup | Pending |

## Originality checklist

- [ ] Both members confirm that no tutorial, repository, or other team's implementation was copied directly.
- [ ] List any external ideas or references actually used.
- [ ] Each member reviews and can explain the database and application files they claim.
- [ ] Each member can explain the SQL schema, triggers, outbox, Cypher, scoring, and auth flow.
- [ ] Check the course policy on AI-assisted work and disclose use as required.
- [ ] Keep the instructor's title and team approval record with the submission material.
