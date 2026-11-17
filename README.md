# RecallGraph

RecallGraph is a failure intelligence system. PostgreSQL stores the authoritative users, services, incidents, symptoms, root-cause categories, constraints, and audit history. Neo4j projects their relationships so the app can find shared symptoms, upstream failures, and three-hop blast radius. The frontend and backend use Next.js 15 App Router/Route Handlers, React 19, and TypeScript. The full design and evidence are in [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md).

## Requirements

- Windows PowerShell 5.1 or newer, or Bash on macOS/Linux
- A running Docker daemon (Docker Desktop or a compatible alternative)
- Node.js 20 or newer with npm
- Free local ports 3000, 5432, 7474, and 7687

## First run from any extracted folder

Open PowerShell inside the extracted `recallgraph` folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Open http://localhost:3000. The setup script creates an ignored `.env` with random PostgreSQL, Neo4j, and JWT secrets; selects an isolated Compose project and available host ports; starts both containers; installs locked dependencies; applies migrations; initializes graph constraints; creates admin and analyst demo accounts; and loads a small sample. It prints each **generated demo password once**. Save them privately. The two account emails are `admin@recallgraph.local` and `analyst@recallgraph.local`.

If you already ran setup, use only `start.ps1` to reopen the app. Keep its PowerShell window open. A second Next process in the same folder may contend for `.next`; stop the earlier process first.

If setup stopped at Neo4j health checks after `.env` was created, an older Docker volume may have a different password. Preserve that volume and retry with `powershell -ExecutionPolicy Bypass -File .\setup.ps1 -FreshInstance`. This keeps the generated secrets in `.env`, chooses a new Compose project and available host ports, then completes setup. You can also pass `-PostgresPort`, `-Neo4jBoltPort`, and `-Neo4jHttpPort` when choosing ports. Do not run seed or start until setup prints both demo account passwords.

### macOS or Linux

With the Docker daemon running, open a terminal in this folder:

```bash
./setup.sh
./start.sh
```

The Bash setup generates private credentials in ignored `.env`, starts the databases, installs dependencies, runs migrations, creates demo accounts, and loads a small sample. Save the two generated account passwords printed at the end. It refuses to overwrite an existing `.env`; if setup was interrupted, follow the manual setup steps below using that file. To use different host database ports on the first run, prefix the setup command with `POSTGRES_PORT=... NEO4J_HTTP_PORT=... NEO4J_BOLT_PORT=...`.

## Bulk synthetic dataset for the DBMS demo

After setup, run:

```powershell
npm run db:seed:bulk
```

This inserts 180 clearly marked **SYNTHETIC** incidents over the preceding 180 days, plus a 10-service dependency graph, 15 symptoms, and eight named root-cause categories. The preexisting `Uncategorised` category remains for migration compatibility. The fixed PRNG seed is `0x5eed2026`; dates are relative to the UTC run day. A repeat run adds no rows. To delete only seed-owned rows and generate them again, use `npm run db:seed:bulk -- --reset`. Do not treat this dataset as production evidence.

## Manual setup

1. Copy `.env.example` to `.env` and replace **all** placeholders. Use the same PostgreSQL username/password/database and host port in `DATABASE_URL`. Match `POSTGRES_PORT`, `NEO4J_HTTP_PORT`, and `NEO4J_BOLT_PORT` to the Compose host ports, and match `NEO4J_URI` to the Bolt port. Set `NEO4J_USER`, `NEO4J_PASSWORD`, a unique `COMPOSE_PROJECT_NAME`, and a random `JWT_SECRET` of at least 32 characters. Keep `.env` private.
2. Run `docker compose up -d --wait`, then `npm ci`.
3. Run `npm run db:migrate` and `node --env-file=.env scripts/init-graph.mjs`.
4. Create accounts with `node --env-file=.env scripts/create-user.mjs you@example.com YOUR_PRIVATE_PASSWORD admin` and an analogous analyst command. Choose passwords of at least 10 characters.
5. Run `npm run db:seed:bulk` for the full demonstration dataset.
6. Run `npm run dev` and open http://localhost:3000.

Migrations are numbered and applied transactionally; rerunning `npm run db:migrate` skips applied versions. `npm run db:snapshot` regenerates the installed SQL schema snapshot. Changing `.env` passwords does not change credentials already stored in Docker volumes. Back up real data before deleting volumes.

## Roles and demonstration path

Analysts log, filter, investigate, and resolve incidents. The drawer shows audit actors/timestamps plus graph-based likely causes, upstream suspects, and ranked similar incidents. Admins additionally reopen/delete incidents, manage catalog entries and dependencies, create users/change roles, view audit history, and inspect/sync the graph outbox. Backend handlers enforce roles even when a button is hidden. The 10-minute demonstration path is in [docs/VIVA_NOTES.md](docs/VIVA_NOTES.md).

## Scripts

| Command                                                      | Purpose                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `npm run db:migrate`                                         | Apply unapplied SQL migrations.                                        |
| `npm run db:seed:bulk`                                       | Insert or report deterministic synthetic demo data.                    |
| `npm run db:queries`                                         | Execute advanced SQL query examples.                                   |
| `npm run db:snapshot`                                        | Save the installed schema.                                             |
| `node --env-file=.env scripts/init-graph.mjs`                | Create Neo4j constraints/index.                                        |
| `npm run graph:resync`                                       | Rebuild the graph projection from SQL.                                 |
| `npm run build`                                              | Production compile and TypeScript check.                               |
| `npm run test:unit` / `test:sql` / `test:api` / `test:graph` | Run one test suite.                                                    |
| `npm run test:all`                                           | Run all suites.                                                        |
| `npm run test:record`                                        | Run all suites and save real output to `docs/test-results/latest.txt`. |

`npm run graph:resync -- --wipe --confirm-wipe` clears **all nodes** in the selected Neo4j database before rebuilding. Verify `NEO4J_URI` targets a dedicated instance first. The ordinary resync prunes projected labels against the SQL source. Graph writes are queued in PostgreSQL in the same transaction as source changes and are retried from the admin Graph Sync panel if Neo4j is unavailable.

## Project evidence and team work

- [Project report](docs/PROJECT_REPORT.md), [Chen ER diagram](docs/recallgraph-chen-er-diagram.svg), [PostgreSQL schema diagram](docs/recallgraph-schema-diagram.svg), [data dictionary](docs/DATA_DICTIONARY.md)
- [Real test output](docs/test-results/latest.txt), [query output](docs/test-results/queries-output.txt), [EXPLAIN plans](docs/test-results/explain-output.txt)
- [Contribution plan](docs/CONTRIBUTIONS.md), [Git guide](docs/GIT_GUIDE.md), [viva notes](docs/VIVA_NOTES.md)

Both member names and SRNs are recorded in the report. The team reports instructor approval and joint work. The [production UI screenshots](docs/PROJECT_REPORT.md#14-application-screenshots) and a current macOS test run are recorded. The initial Git commit imports the ZIP under Atharva Anand's identity; it does not establish individual authorship of the imported files. Atharva Ashish Vyas has a pending collaborator invitation and should make or review genuine future work under his own identity. Both members should rehearse the demo and confirm any academic originality disclosures required by the course.
