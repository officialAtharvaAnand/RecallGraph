# RecallGraph progress

Status is backed by a command or a file path. `Partial` means implementation or verification remains.

| Item | Status      | Evidence                                                                                                    |
| ---- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| P4.1 | Done        | lib/http.ts; checkpoint4 HTTP errors 400/409.                                                               |
| P4.2 | Done        | lib/validation.ts and route UUID/query checks.                                                              |
| P4.3 | Done        | lib/db.ts withTransaction; checkpoint4 actor check.                                                         |
| P4.4 | Done        | resolve_incident call and reopen route; checkpoint4 resolve 200.                                            |
| P4.5 | Done        | transactional admin delete in incident route.                                                               |
| P4.6 | Done        | paginated filtered GET /api/incidents.                                                                      |
| P4.7 | Done        | migration 005, lib/auth.ts, /api/auth rate limit.                                                           |
| P4.8 | Done        | requireUser shared across handlers.                                                                         |
| P4.9 | Done        | /api/admin/users routes and bcrypt cost 12.                                                                 |
| P5.1 | Done        | IncidentFilters/List/Card and paginated API.                                                                |
| P5.2 | Done        | ResolveDialog, ConfirmDialog, incident actions.                                                             |
| P5.3 | Done        | IncidentDrawer with events, insights, similar.                                                              |
| P5.4 | Done        | Dashboard metrics, stats, recurrence, graph.                                                                |
| P5.5 | Done        | AdminPanel, UsersPanel, GraphSyncPanel.                                                                     |
| P5.6 | Needs human | Loading/error/disabled/labels and responsive CSS implemented; user must inspect 380px and take screenshots. |
| P5.7 | Done        | cookie-based lib/api-client and 401 event.                                                                  |
| P6.1 | Done        | scripts/seed-bulk.mjs fixed PRNG seed 0x5eed2026.                                                           |
| P6.2 | Done        | --reset removed and reseeded 180 rows; rerun said already present, no rows added.                           |
| P6.3 | Done        | 10 services, 15 symptoms, 8 named categories, 9 edges; seed output.                                         |
| P6.4 | Done        | 180 correlated incidents; seed output 108 resolved/36 investigating/36 open.                                |
| P6.5 | Done        | shared lib/outbox-core.mjs; 924 rows processed, 0 pending/failed.                                           |
| P6.6 | Done        | seed summary printed real SQL and graph counts.                                                             |
| P6.7 | Done        | SYNTHETIC header in seed-bulk.mjs and docs/test-results/README.md.                                          |
| P7.1 | Done        | scripts/test-db.mjs creates/migrates/drops isolated _test DB.                                               |
| P7.2 | Done        | test-db.mjs starts temporary Next server and creates random-password users.                                 |
| P7.3 | Done        | package.json test scripts; latest.txt real output, exit 0.                                                  |
| P7.4 | Done        | 7 unit passes in latest.txt.                                                                                |
| P7.5 | Done        | 14 SQL passes in latest.txt.                                                                                |
| P7.6 | Done        | 10 API passes in latest.txt.                                                                                |
| P7.7 | Done        | 4 graph/outbox passes in latest.txt; outage simulated at worker level.                                      |

| P8.1 | Done | PROJECT_REPORT.md section 1; diagrams/dictionary/evidence linked as applicable. |
| P8.2 | Done | PROJECT_REPORT.md section 2; diagrams/dictionary/evidence linked as applicable. |
| P8.3 | Done | PROJECT_REPORT.md section 3; diagrams/dictionary/evidence linked as applicable. |
| P8.4 | Done | PROJECT_REPORT.md section 4; diagrams/dictionary/evidence linked as applicable. |
| P8.5 | Done | PROJECT_REPORT.md section 5; diagrams/dictionary/evidence linked as applicable. |
| P8.6 | Done | PROJECT_REPORT.md section 6; diagrams/dictionary/evidence linked as applicable. |
| P8.7 | Done | PROJECT_REPORT.md section 7; diagrams/dictionary/evidence linked as applicable. |
| P8.8 | Done | PROJECT_REPORT.md section 8; diagrams/dictionary/evidence linked as applicable. |
| P8.9 | Done | PROJECT_REPORT.md section 9; diagrams/dictionary/evidence linked as applicable. |
| P8.10 | Done | PROJECT_REPORT.md section 10; diagrams/dictionary/evidence linked as applicable. |
| P8.11 | Done | PROJECT_REPORT.md section 11; diagrams/dictionary/evidence linked as applicable. |
| P8.12 | Done | PROJECT_REPORT.md section 12; diagrams/dictionary/evidence linked as applicable. |
| P8.13 | Done | PROJECT_REPORT.md section 13; diagrams/dictionary/evidence linked as applicable. |
| P8.14 | Needs human | Authentic final UI screenshots must be taken by team. |
| P8.15 | Done | PROJECT_REPORT.md section 15; diagrams/dictionary/evidence linked as applicable. |
| P8.16 | Done | PROJECT_REPORT.md section 16; diagrams/dictionary/evidence linked as applicable. |
| P8.17 | Done | PROJECT_REPORT.md section 17; diagrams/dictionary/evidence linked as applicable. |
| P8.18 | Done | PROJECT_REPORT.md section 18; diagrams/dictionary/evidence linked as applicable. |
| P8.19 | Needs human | Names/SRNs supplied and entered; actual contributions and real commits remain team work. |
| P9.1 | Done | CONTRIBUTIONS.md, GIT_GUIDE.md, VIVA_NOTES.md and code comments. |
| P9.2 | Done | CONTRIBUTIONS.md, GIT_GUIDE.md, VIVA_NOTES.md and code comments. |
| P9.3 | Done | CONTRIBUTIONS.md, GIT_GUIDE.md, VIVA_NOTES.md and code comments. |
| P9.4 | Done | CONTRIBUTIONS.md, GIT_GUIDE.md, VIVA_NOTES.md and code comments. |
| P9.5 | Done | CONTRIBUTIONS.md, GIT_GUIDE.md, VIVA_NOTES.md and code comments. |
| P9.6 | Done | CONTRIBUTIONS.md, GIT_GUIDE.md, VIVA_NOTES.md and code comments. |
| P10.1 | Done | Isolated clean Compose setup, HTTP 200, test:all 34/34; clean-install-latest.txt. |
| P10.2 | Done | REQUIREMENTS_CHECKLIST.md covers PDF bullets. |
| P10.3 | Done | FINAL_AUDIT.md F1–F14 table with evidence and limits. |
| P10.4 | Done | FINAL_AUDIT.md security sweep; test-results/security-scan.txt and npm-audit.json. |
| P10.5 | Done | PROJECT_REPORT.md section 9–10 counts live SQL and graph features. |
| P10.6 | Done | FINAL_AUDIT.md severity-ranked red flags, human tasks, ten-minute demo. |
