# Endpoint-to-UI map

| Method and endpoint | UI element | Access |
| --- | --- | --- |
| GET /api/auth | Page session gate | Public |
| POST /api/auth | LoginForm sign-in | Public |
| DELETE /api/auth | Header sign-out | Signed in |
| GET /api/incidents | IncidentFilters, IncidentList, pagination | Analyst/admin |
| POST /api/incidents | IncidentForm | Analyst/admin |
| PATCH /api/incidents/[id] | IncidentCard investigate; ResolveDialog | Analyst/admin |
| DELETE /api/incidents/[id] | IncidentCard delete and ConfirmDialog | Admin |
| POST /api/incidents/[id]/reopen | IncidentCard reopen and ConfirmDialog | Admin |
| GET /api/incidents/[id]/events | IncidentDrawer audit timeline | Analyst/admin |
| GET /api/incidents/[id]/insights | IncidentDrawer likely causes/upstream suspects | Analyst/admin |
| GET /api/similar?id= | IncidentDrawer ranked similar incidents | Analyst/admin |
| GET /api/insights | Dashboard metrics, resolution stats, recurrence, co-occurrence; form catalogs | Analyst/admin |
| GET /api/services/[id]/blast-radius | Dashboard blast-radius selector | Analyst/admin |
| GET /api/admin | AdminPanel catalog, dependency list, audit log | Admin |
| POST /api/admin | AdminPanel add service/symptom/category/dependency | Admin |
| DELETE /api/admin | AdminPanel remove dependency | Admin |
| GET /api/admin/graph-sync | GraphSyncPanel status | Admin |
| POST /api/admin/graph-sync | GraphSyncPanel Sync now | Admin |
| GET /api/admin/users | UsersPanel user list | Admin |
| POST /api/admin/users | UsersPanel create form | Admin |
| PATCH /api/admin/users/[id] | UsersPanel role selector | Admin |
