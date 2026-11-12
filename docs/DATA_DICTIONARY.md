# Database data dictionary

Generated from the migrated PostgreSQL catalog. These are the installed types and rules.

## graph_outbox

Retryable graph projection queue.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| id | bigint | NOT NULL | — | PK | Stable identifier. |
| op | text | NOT NULL | — | CHECK | op value. |
| payload | jsonb | NOT NULL | — | — | Identifiers for a queued graph change. |
| attempts | integer | NOT NULL | 0 | — | Failed projection attempts. |
| last_error | text | NULL | — | — | Last graph projection error. |
| created_at | timestamp with time zone | NOT NULL | now() | — | created at value. |
| processed_at | timestamp with time zone | NULL | — | — | Successful graph projection time. |

## incident_events

Durable audit event retained after deletion.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| id | bigint | NOT NULL | — | FK, PK | Stable identifier. |
| incident_id | uuid | NOT NULL | — | — | Reference identifier for incident. |
| actor_id | uuid | NULL | — | FK | User responsible for the audit event. |
| event_type | text | NOT NULL | — | CHECK | event type value. |
| detail | jsonb | NOT NULL | '{}'::jsonb | — | detail value. |
| happened_at | timestamp with time zone | NOT NULL | now() | — | happened at value. |
| incident_title | text | NOT NULL | — | — | Title snapshot retained after deletion. |

## incident_symptoms

Incident-to-symptom many-to-many link.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| incident_id | uuid | NOT NULL | — | FK, PK | Reference identifier for incident. |
| symptom_id | uuid | NOT NULL | — | PK, FK | Reference identifier for symptom. |

## incidents

Canonical failure and resolution record.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| id | uuid | NOT NULL | gen_random_uuid() | PK, CHECK, FK | Stable identifier. |
| title | text | NOT NULL | — | CHECK | title value. |
| summary | text | NOT NULL | — | CHECK | summary value. |
| service_id | uuid | NOT NULL | — | FK | Reference identifier for service. |
| severity | smallint | NOT NULL | — | CHECK | severity value. |
| status | incident_status | NOT NULL | 'open'::incident_status | CHECK | status value. |
| root_cause | text | NULL | — | CHECK, FK | root cause value. |
| occurred_at | timestamp with time zone | NOT NULL | — | CHECK | occurred at value. |
| resolved_at | timestamp with time zone | NULL | — | CHECK | resolved at value. |
| created_by | uuid | NOT NULL | — | FK | created by value. |
| created_at | timestamp with time zone | NOT NULL | now() | — | created at value. |
| updated_at | timestamp with time zone | NOT NULL | now() | — | updated at value. |
| root_cause_category_id | uuid | NULL | — | CHECK, FK | Reference identifier for root cause category. |
| search_vector | tsvector | NULL | to_tsvector('english'::regconfig, ((((title \|\| ' '::text) \|\| summary) \|\| ' '::text) \|\| COALESCE(root_cause, ''::text))) | — | Generated and indexed full-text document. |
| synthetic_seed | text | NULL | — | — | Marker for safe synthetic reset. |

## root_cause_categories

Controlled cause vocabulary.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| id | uuid | NOT NULL | gen_random_uuid() | PK | Stable identifier. |
| label | text | NOT NULL | — | CHECK, UNIQUE | label value. |

## schema_migrations

Applied schema versions.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| version | text | NOT NULL | — | PK | version value. |
| applied_at | timestamp with time zone | NOT NULL | now() | — | applied at value. |

## service_dependencies

Directed service dependency.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| service_id | uuid | NOT NULL | — | CHECK, FK, PK | Reference identifier for service. |
| depends_on_service_id | uuid | NOT NULL | — | CHECK, FK, PK | Reference identifier for depends on service. |

## services

Tracked service and ownership.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| id | uuid | NOT NULL | gen_random_uuid() | PK | Stable identifier. |
| name | text | NOT NULL | — | CHECK, UNIQUE | name value. |
| owner_team | text | NOT NULL | — | CHECK | owner team value. |

## symptoms

Controlled symptom vocabulary.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| id | uuid | NOT NULL | gen_random_uuid() | PK | Stable identifier. |
| label | text | NOT NULL | — | CHECK, UNIQUE | label value. |

## synthetic_seed_edges

Bulk-seed dependency ownership.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| service_id | uuid | NOT NULL | — | PK | Reference identifier for service. |
| depends_on_service_id | uuid | NOT NULL | — | PK | Reference identifier for depends on service. |

## synthetic_seed_rows

Bulk-seed reference ownership.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| table_name | text | NOT NULL | — | PK, CHECK | table name value. |
| record_id | uuid | NOT NULL | — | PK | Reference identifier for record. |

## users

Account, role, and session version.

| Column | Type | Nullability | Default | Keys/rules | Description |
| --- | --- | --- | --- | --- | --- |
| id | uuid | NOT NULL | gen_random_uuid() | PK | Stable identifier. |
| email | text | NOT NULL | — | CHECK, UNIQUE | email value. |
| password_hash | text | NOT NULL | — | — | bcrypt password hash, never plaintext. |
| role | user_role | NOT NULL | 'analyst'::user_role | — | role value. |
| created_at | timestamp with time zone | NOT NULL | now() | — | created at value. |
| token_version | integer | NOT NULL | 0 | — | Incremented to revoke sessions. |

## Installed constraints

| Table | Name | Actual definition |
| --- | --- | --- |
| graph_outbox | graph_outbox_op_check | CHECK ((op = ANY (ARRAY['upsert_incident'::text, 'delete_incident'::text, 'upsert_service'::text, 'delete_service'::text, 'upsert_symptom'::text, 'delete_symptom'::text, 'upsert_root_cause'::text, 'delete_root_cause'::text, 'set_dependency'::text, 'remove_dependency'::text]))) |
| graph_outbox | graph_outbox_pkey | PRIMARY KEY (id) |
| incident_events | incident_events_actor_id_fkey | FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL |
| incident_events | incident_events_event_type_check | CHECK ((event_type = ANY (ARRAY['created'::text, 'status_changed'::text, 'root_cause_updated'::text, 'deleted'::text, 'reopened'::text]))) |
| incident_events | incident_events_pkey | PRIMARY KEY (id) |
| incident_symptoms | incident_symptoms_incident_id_fkey | FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE |
| incident_symptoms | incident_symptoms_pkey | PRIMARY KEY (incident_id, symptom_id) |
| incident_symptoms | incident_symptoms_symptom_id_fkey | FOREIGN KEY (symptom_id) REFERENCES symptoms(id) ON DELETE RESTRICT |
| incidents | incidents_check | CHECK (((resolved_at IS NULL) OR (resolved_at >= occurred_at))) |
| incidents | incidents_created_by_fkey | FOREIGN KEY (created_by) REFERENCES users(id) |
| incidents | incidents_pkey | PRIMARY KEY (id) |
| incidents | incidents_resolution_complete | CHECK (((status <> 'resolved'::incident_status) OR ((resolved_at IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM root_cause), ''::text) IS NOT NULL) AND (root_cause_category_id IS NOT NULL)))) |
| incidents | incidents_root_cause_category_id_fkey | FOREIGN KEY (root_cause_category_id) REFERENCES root_cause_categories(id) ON DELETE RESTRICT |
| incidents | incidents_service_id_fkey | FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT |
| incidents | incidents_severity_check | CHECK (((severity >= 1) AND (severity <= 5))) |
| incidents | incidents_summary_check | CHECK ((length(TRIM(BOTH FROM summary)) >= 10)) |
| incidents | incidents_title_check | CHECK (((length(TRIM(BOTH FROM title)) >= 5) AND (length(TRIM(BOTH FROM title)) <= 180))) |
| root_cause_categories | root_cause_categories_label_check | CHECK (((length(TRIM(BOTH FROM label)) >= 3) AND (length(TRIM(BOTH FROM label)) <= 80))) |
| root_cause_categories | root_cause_categories_label_key | UNIQUE (label) |
| root_cause_categories | root_cause_categories_pkey | PRIMARY KEY (id) |
| schema_migrations | schema_migrations_pkey | PRIMARY KEY (version) |
| service_dependencies | service_dependencies_check | CHECK ((service_id <> depends_on_service_id)) |
| service_dependencies | service_dependencies_depends_on_service_id_fkey | FOREIGN KEY (depends_on_service_id) REFERENCES services(id) ON DELETE CASCADE |
| service_dependencies | service_dependencies_pkey | PRIMARY KEY (service_id, depends_on_service_id) |
| service_dependencies | service_dependencies_service_id_fkey | FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE |
| services | services_name_check | CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 100))) |
| services | services_name_key | UNIQUE (name) |
| services | services_owner_team_check | CHECK ((length(TRIM(BOTH FROM owner_team)) > 0)) |
| services | services_pkey | PRIMARY KEY (id) |
| symptoms | symptoms_label_check | CHECK (((length(TRIM(BOTH FROM label)) >= 3) AND (length(TRIM(BOTH FROM label)) <= 100))) |
| symptoms | symptoms_label_key | UNIQUE (label) |
| symptoms | symptoms_pkey | PRIMARY KEY (id) |
| synthetic_seed_edges | synthetic_seed_edges_pkey | PRIMARY KEY (service_id, depends_on_service_id) |
| synthetic_seed_rows | synthetic_seed_rows_pkey | PRIMARY KEY (table_name, record_id) |
| synthetic_seed_rows | synthetic_seed_rows_table_name_check | CHECK ((table_name = ANY (ARRAY['services'::text, 'symptoms'::text, 'root_cause_categories'::text]))) |
| users | users_email_check | CHECK (((email = lower(email)) AND (length(email) <= 254))) |
| users | users_email_key | UNIQUE (email) |
| users | users_pkey | PRIMARY KEY (id) |

## Installed indexes

| Table | Name | Actual definition |
| --- | --- | --- |
| graph_outbox | graph_outbox_pending_idx | CREATE INDEX graph_outbox_pending_idx ON public.graph_outbox USING btree (id) WHERE (processed_at IS NULL) |
| graph_outbox | graph_outbox_pkey | CREATE UNIQUE INDEX graph_outbox_pkey ON public.graph_outbox USING btree (id) |
| incident_events | events_incident_time_idx | CREATE INDEX events_incident_time_idx ON public.incident_events USING btree (incident_id, happened_at DESC) |
| incident_events | incident_events_pkey | CREATE UNIQUE INDEX incident_events_pkey ON public.incident_events USING btree (id) |
| incident_symptoms | incident_symptoms_pkey | CREATE UNIQUE INDEX incident_symptoms_pkey ON public.incident_symptoms USING btree (incident_id, symptom_id) |
| incident_symptoms | incident_symptoms_symptom_idx | CREATE INDEX incident_symptoms_symptom_idx ON public.incident_symptoms USING btree (symptom_id) |
| incidents | incidents_pkey | CREATE UNIQUE INDEX incidents_pkey ON public.incidents USING btree (id) |
| incidents | incidents_search_vector_idx | CREATE INDEX incidents_search_vector_idx ON public.incidents USING gin (search_vector) |
| incidents | incidents_service_time_idx | CREATE INDEX incidents_service_time_idx ON public.incidents USING btree (service_id, occurred_at DESC) |
| incidents | incidents_status_severity_idx | CREATE INDEX incidents_status_severity_idx ON public.incidents USING btree (status, severity) |
| incidents | incidents_synthetic_seed_idx | CREATE INDEX incidents_synthetic_seed_idx ON public.incidents USING btree (synthetic_seed) WHERE (synthetic_seed IS NOT NULL) |
| root_cause_categories | root_cause_categories_label_key | CREATE UNIQUE INDEX root_cause_categories_label_key ON public.root_cause_categories USING btree (label) |
| root_cause_categories | root_cause_categories_pkey | CREATE UNIQUE INDEX root_cause_categories_pkey ON public.root_cause_categories USING btree (id) |
| schema_migrations | schema_migrations_pkey | CREATE UNIQUE INDEX schema_migrations_pkey ON public.schema_migrations USING btree (version) |
| service_dependencies | service_dependencies_pkey | CREATE UNIQUE INDEX service_dependencies_pkey ON public.service_dependencies USING btree (service_id, depends_on_service_id) |
| services | services_name_key | CREATE UNIQUE INDEX services_name_key ON public.services USING btree (name) |
| services | services_pkey | CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id) |
| symptoms | symptoms_label_key | CREATE UNIQUE INDEX symptoms_label_key ON public.symptoms USING btree (label) |
| symptoms | symptoms_pkey | CREATE UNIQUE INDEX symptoms_pkey ON public.symptoms USING btree (id) |
| synthetic_seed_edges | synthetic_seed_edges_pkey | CREATE UNIQUE INDEX synthetic_seed_edges_pkey ON public.synthetic_seed_edges USING btree (service_id, depends_on_service_id) |
| synthetic_seed_rows | synthetic_seed_rows_pkey | CREATE UNIQUE INDEX synthetic_seed_rows_pkey ON public.synthetic_seed_rows USING btree (table_name, record_id) |
| users | users_email_key | CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email) |
| users | users_pkey | CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id) |

## Views

| View | Purpose and UI use |
| --- | --- |
| service_failure_summary | Incident, active, and critical counts by service; Dashboard. |
| incident_resolution_stats | Average resolution interval by service and category; Dashboard. |

## Triggers

| Table | Trigger | Purpose |
| --- | --- | --- |
| incident_symptoms | graph_incident_symptoms | Queue graph projection. |
| incident_symptoms | graph_incident_symptoms | Queue graph projection. |
| incidents | graph_incidents | Queue graph projection. |
| incidents | graph_incidents | Queue graph projection. |
| incidents | graph_incidents | Queue graph projection. |
| incidents | incidents_audit | Write audit event. |
| incidents | incidents_audit | Write audit event. |
| incidents | incidents_audit_delete | Write audit event. |
| incidents | incidents_occurrence_time | Reject future occurrence. |
| incidents | incidents_occurrence_time | Reject future occurrence. |
| incidents | incidents_status_transition | Validate status transition. |
| incidents | incidents_touch | Maintain updated timestamp. |
| root_cause_categories | graph_root_causes | Queue graph projection. |
| root_cause_categories | graph_root_causes | Queue graph projection. |
| root_cause_categories | graph_root_causes_delete | Queue graph projection. |
| service_dependencies | dependency_two_cycle | Maintain updated timestamp. |
| service_dependencies | dependency_two_cycle | Maintain updated timestamp. |
| service_dependencies | graph_dependencies | Queue graph projection. |
| service_dependencies | graph_dependencies | Queue graph projection. |
| services | graph_services | Queue graph projection. |
| services | graph_services | Queue graph projection. |
| services | graph_services_delete | Queue graph projection. |
| symptoms | graph_symptoms | Queue graph projection. |
| symptoms | graph_symptoms | Queue graph projection. |
| symptoms | graph_symptoms_delete | Queue graph projection. |

## Functions

| Function | Purpose |
| --- | --- |
| armor(bytea) | Database integrity trigger. |
| armor(bytea, text[], text[]) | Database integrity trigger. |
| audit_incident() | Incident audit trigger. |
| audit_incident_delete() | Incident audit trigger. |
| crypt(text, text) | Database integrity trigger. |
| dearmor(text) | Database integrity trigger. |
| decrypt(bytea, bytea, text) | Database integrity trigger. |
| decrypt_iv(bytea, bytea, bytea, text) | Database integrity trigger. |
| digest(text, text) | Database integrity trigger. |
| digest(bytea, text) | Database integrity trigger. |
| encrypt(bytea, bytea, text) | Database integrity trigger. |
| encrypt_iv(bytea, bytea, bytea, text) | Database integrity trigger. |
| enforce_status_transition() | Database integrity trigger. |
| enqueue_graph_change() | Transactional outbox trigger. |
| enqueue_graph_reference_delete() | Transactional outbox trigger. |
| gen_random_bytes(integer) | Database integrity trigger. |
| gen_random_uuid() | Database integrity trigger. |
| gen_salt(text) | Database integrity trigger. |
| gen_salt(text, integer) | Database integrity trigger. |
| hmac(bytea, bytea, text) | Database integrity trigger. |
| hmac(text, text, text) | Database integrity trigger. |
| pgp_armor_headers(text, OUT key text, OUT value text) | Database integrity trigger. |
| pgp_key_id(bytea) | Database integrity trigger. |
| pgp_pub_decrypt(bytea, bytea, text) | Database integrity trigger. |
| pgp_pub_decrypt(bytea, bytea, text, text) | Database integrity trigger. |
| pgp_pub_decrypt(bytea, bytea) | Database integrity trigger. |
| pgp_pub_decrypt_bytea(bytea, bytea, text, text) | Database integrity trigger. |
| pgp_pub_decrypt_bytea(bytea, bytea) | Database integrity trigger. |
| pgp_pub_decrypt_bytea(bytea, bytea, text) | Database integrity trigger. |
| pgp_pub_encrypt(text, bytea) | Database integrity trigger. |
| pgp_pub_encrypt(text, bytea, text) | Database integrity trigger. |
| pgp_pub_encrypt_bytea(bytea, bytea) | Database integrity trigger. |
| pgp_pub_encrypt_bytea(bytea, bytea, text) | Database integrity trigger. |
| pgp_sym_decrypt(bytea, text) | Database integrity trigger. |
| pgp_sym_decrypt(bytea, text, text) | Database integrity trigger. |
| pgp_sym_decrypt_bytea(bytea, text, text) | Database integrity trigger. |
| pgp_sym_decrypt_bytea(bytea, text) | Database integrity trigger. |
| pgp_sym_encrypt(text, text, text) | Database integrity trigger. |
| pgp_sym_encrypt(text, text) | Database integrity trigger. |
| pgp_sym_encrypt_bytea(bytea, text) | Database integrity trigger. |
| pgp_sym_encrypt_bytea(bytea, text, text) | Database integrity trigger. |
| reject_dependency_two_cycle() | Database integrity trigger. |
| reject_future_incident() | Database integrity trigger. |
| reopen_incident(p_id uuid, p_reason text) | Controlled reopen through POST reopen API. |
| resolve_incident(p_id uuid, p_root_cause text, p_category_id uuid) | Atomic resolution through PATCH incident API. |
| touch_incident() | Database integrity trigger. |
