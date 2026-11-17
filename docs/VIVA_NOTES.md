# RecallGraph viva notes

These answers refer to the current source. They are study prompts, not a substitute for each member reading the files and running the demo.

1. **What problem does RecallGraph solve?** It connects repeated incidents across symptoms, services, causes, and dependencies instead of leaving them as isolated records. See <code>components/IncidentDrawer.tsx</code> and <code>lib/graph.ts</code>.
2. **Why PostgreSQL?** It owns accounts, incidents, catalogs, constraints, audit events, and the transactional outbox; those facts need ACID and foreign keys. See migrations 001–007.
3. **Why Neo4j?** Multi-hop service dependencies and shared-neighbour symptoms/causes map directly to graph paths. See <code>lib/graph.ts:blastRadius</code>, <code>upstreamSuspects</code>, and <code>likelyRootCauses</code>.
4. **Could SQL alone answer blast radius?** Yes. <code>scripts/compare-blast.mjs</code> uses a recursive CTE and returns the same four dependents. Neo4j is chosen for expressing several evolving traversals, not a proven speed win.
5. **Why no vector database?** This is the course's SQL+NoSQL option. <code>lib/scoring.ts</code> uses exact, explainable signals. No embeddings or vector metrics are present.
6. **What are the main ER entities?** Users, services, incidents, symptoms, root-cause categories, events, join tables, outbox, and seed/migration metadata. See <code>docs/recallgraph-chen-er-diagram.svg</code> and <code>docs/recallgraph-schema-diagram.svg</code>.
7. **How are many-to-many symptoms modeled?** <code>incident_symptoms</code> has a composite key and two foreign keys. See migration 001.
8. **Is the schema normalized?** Core facts are separated into 3NF tables. Audit title/incident UUID snapshots deliberately preserve history after deletion; search_vector is a generated derivative. See report Section 7 and migration 003.
9. **Which SQL transaction feature is live?** <code>lib/db.ts:withTransaction</code> and <code>lib/transaction-core.mjs</code> wrap writes, sets actor context, commits or rolls back. API routes use it.
10. **Which views are live?** <code>service_failure_summary</code> and <code>incident_resolution_stats</code> feed <code>/api/insights</code> and Dashboard. See migration 003.
11. **Which stored functions are live?** <code>resolve_incident</code> and <code>reopen_incident</code> are called by incident Route Handlers. See migration 003 and API lifecycle test.
12. **Which triggers are live?** Touch timestamp, audit events, status transition, future-time rejection, dependency two-cycle rejection, and outbox enqueue. See migrations 001, 003, 004, 007.
13. **How is the audit actor recorded?** The API uses transaction-local <code>set_config('app.current_user_id')</code>; the audit trigger reads it. See <code>withTransaction</code> and SQL actor test.
14. **Why does audit survive incident deletion?** Migration 003 drops the event-to-incident FK, stores a title snapshot, and adds a BEFORE DELETE audit trigger. See SQL deletion test.
15. **What prevents invalid status changes?** <code>enforce_status_transition</code> rejects direct resolved→open. <code>reopen_incident</code> temporarily enables resolved→investigating and logs a reason.
16. **What happens if resolution fails halfway?** The stored function runs inside a PostgreSQL transaction, so the row remains unchanged. See SQL atomicity test.
17. **How is full-text search implemented?** A stored generated <code>tsvector</code> column and GIN index; GET incidents uses <code>@@ plainto_tsquery</code>. See migration 003 and EXPLAIN output.
18. **Did the FTS plan use the index?** The natural planner used a sequential scan on one small 180-row case; a forced access-path comparison used the GIN index. See <code>docs/test-results/explain-output.txt</code>. Do not claim a measured speedup.
19. **What does the outbox guarantee?** SQL changes and queue rows commit together; a failed graph write remains pending with an error. It does not make Neo4j synchronously consistent. See migration 004 and <code>lib/outbox-core.mjs</code>.
20. **Why SKIP LOCKED?** A worker locks one pending row and another worker can claim a different row rather than block. See <code>drainOutbox</code>.
21. **How does graph retry avoid duplicates?** Nodes and edges use <code>MERGE</code> by SQL UUID; incident edges are replaced in one graph transaction. See <code>lib/outbox-core.mjs:project</code>.
22. **How do you recover a damaged graph?** Run <code>npm run graph:resync</code> from PostgreSQL. A full wipe requires <code>--wipe --confirm-wipe</code> and deletes all graph nodes, so only use it on a dedicated instance.
23. **What is blast radius?** Services depending on a selected service within three hops, plus recent incident counts. See <code>lib/graph.ts:blastRadius</code>.
24. **What are upstream suspects?** Incidents on upstream dependencies during the six hours before a selected incident. See <code>lib/graph.ts:upstreamSuspects</code>.
25. **How are similar incidents scored?** 35 per shared symptom, 25 same service, 15 similar severity, 10 recent; capped at 100. Reasons are shown. See <code>lib/scoring.ts:scoreMatch</code>.
26. **What are scoring limits?** It is a heuristic, not probability or causal inference; exact symptom labels can miss synonyms. See <code>lib/scoring.ts</code>.
27. **How are roles enforced?** <code>requireUser('admin')</code> reads current role/version from PostgreSQL on each protected request. Analyst/admin API tests check 403. UI hiding alone is insufficient.
28. **How are secrets and sessions handled?** <code>setup.ps1</code> generates secrets in ignored <code>.env</code>; passwords are bcrypt hashes; JWT is in an HTTP-only SameSite=Lax cookie, Secure on HTTPS. See <code>lib/auth.ts</code>, <code>/api/auth</code>.
29. **Where is validation enforced?** Zod schemas and UI forms reject bad shapes; PostgreSQL CHECK/FK/triggers enforce final integrity. <code>lib/http.ts</code> maps known DB errors to 4xx JSON. See SQL/API tests.
30. **What is original, and what would you improve?** The app combines retained audit history, explainable incident matching, dependency suspects, and a retryable SQL-to-graph projection. Production improvements include a durable worker, shared rate limiter, graph isolation, and richer semantic matching. See report Sections 1 and 16.

## Five-minute live demonstration

1. **0:00–0:45** Open the rendered ER and graph diagrams. Point out incident FKs, audit snapshot, and directed service dependency.
2. **0:45–1:30** Show migrations 003/004: constraint/trigger, stored resolve function, generated FTS index, outbox table. Explain one real EXPLAIN plan honestly.
3. **1:30–2:30** Sign in as analyst. Filter/paginate incidents, open a Checkout incident drawer, show audit events, similar score/reasons, likely causes, and upstream suspects.
4. **2:30–3:20** Start investigation and resolve an incident with a category. Show the actor in the timeline and a changed resolution statistic.
5. **3:20–4:10** Sign in as admin. Show dependency management, user roles, audit log, and Graph Sync pending/failed counts. Demonstrate blast radius.
6. **4:10–5:00** Show real <code>docs/test-results/latest.txt</code> and <code>git shortlog -sn --all</code> after both students have made genuine commits. State one limitation.
