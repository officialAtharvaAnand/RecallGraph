-- Registry ensures --reset removes only rows created by the bulk seed.
CREATE TABLE synthetic_seed_rows (
  table_name text NOT NULL CHECK (table_name IN ('services','symptoms','root_cause_categories')),
  record_id uuid NOT NULL,
  PRIMARY KEY (table_name,record_id)
);
CREATE TABLE synthetic_seed_edges (
  service_id uuid NOT NULL,
  depends_on_service_id uuid NOT NULL,
  PRIMARY KEY (service_id,depends_on_service_id)
);
ALTER TABLE incidents ADD COLUMN synthetic_seed text;
CREATE INDEX incidents_synthetic_seed_idx ON incidents(synthetic_seed)
  WHERE synthetic_seed IS NOT NULL;
