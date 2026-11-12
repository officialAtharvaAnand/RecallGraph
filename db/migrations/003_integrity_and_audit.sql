-- Preserve audit history after an incident is deleted.
ALTER TABLE incident_events DROP CONSTRAINT incident_events_incident_id_fkey;
ALTER TABLE incident_events ADD COLUMN incident_title text;
UPDATE incident_events e SET incident_title = i.title FROM incidents i WHERE i.id = e.incident_id;
ALTER TABLE incident_events ALTER COLUMN incident_title SET NOT NULL;

-- Keep actor references valid while allowing user removal later.
ALTER TABLE incident_events DROP CONSTRAINT incident_events_actor_id_fkey;
ALTER TABLE incident_events ADD CONSTRAINT incident_events_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add the explicit reopened audit event.
ALTER TABLE incident_events DROP CONSTRAINT incident_events_event_type_check;
ALTER TABLE incident_events ADD CONSTRAINT incident_events_event_type_check
  CHECK (event_type IN ('created','status_changed','root_cause_updated','deleted','reopened'));

-- Keep root-cause classification relational and enforce it for resolved rows.
CREATE TABLE root_cause_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE CHECK (length(trim(label)) BETWEEN 3 AND 80)
);
INSERT INTO root_cause_categories(label) VALUES
  ('Uncategorised'), ('Connection pool exhaustion'), ('Bad deployment'),
  ('Dependency outage'), ('Config error'), ('Capacity limit'),
  ('Data corruption'), ('Network failure'), ('Third-party failure')
ON CONFLICT DO NOTHING;
ALTER TABLE incidents ADD COLUMN root_cause_category_id uuid
  REFERENCES root_cause_categories(id) ON DELETE RESTRICT;
UPDATE incidents SET root_cause_category_id =
  (SELECT id FROM root_cause_categories WHERE label = 'Uncategorised')
WHERE status = 'resolved' AND root_cause_category_id IS NULL;
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO constraint_name FROM pg_constraint
  WHERE conrelid = 'incidents'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%resolved%root_cause%'
  LIMIT 1;
  IF constraint_name IS NULL THEN RAISE EXCEPTION 'Old resolution constraint not found'; END IF;
  EXECUTE format('ALTER TABLE incidents DROP CONSTRAINT %I', constraint_name);
END $$;
ALTER TABLE incidents ADD CONSTRAINT incidents_resolution_complete CHECK (
  status <> 'resolved' OR
  (resolved_at IS NOT NULL AND nullif(trim(root_cause),'') IS NOT NULL
   AND root_cause_category_id IS NOT NULL)
);

-- Prevent direct dependency loops while allowing longer paths for graph analysis.
CREATE TABLE service_dependencies (
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  depends_on_service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, depends_on_service_id),
  CHECK (service_id <> depends_on_service_id)
);
CREATE FUNCTION reject_dependency_two_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM service_dependencies
             WHERE service_id = NEW.depends_on_service_id
               AND depends_on_service_id = NEW.service_id) THEN
    RAISE EXCEPTION 'Direct dependency cycle is forbidden' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dependency_two_cycle BEFORE INSERT OR UPDATE ON service_dependencies
  FOR EACH ROW EXECUTE FUNCTION reject_dependency_two_cycle();

-- Record the transaction-local actor and a durable title snapshot.
CREATE OR REPLACE FUNCTION audit_incident() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
    VALUES(NEW.id,NEW.title,coalesce(actor,NEW.created_by),'created',jsonb_build_object('status',NEW.status));
  ELSE
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
      VALUES(NEW.id,NEW.title,actor,'status_changed',jsonb_build_object('from',OLD.status,'to',NEW.status));
    END IF;
    IF OLD.root_cause IS DISTINCT FROM NEW.root_cause THEN
      INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
      VALUES(NEW.id,NEW.title,actor,'root_cause_updated',jsonb_build_object('root_cause',NEW.root_cause));
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION audit_incident_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
  VALUES(OLD.id,OLD.title,nullif(current_setting('app.current_user_id',true),'')::uuid,
         'deleted',jsonb_build_object('status',OLD.status));
  RETURN OLD;
END $$;
CREATE TRIGGER incidents_audit_delete BEFORE DELETE ON incidents
  FOR EACH ROW EXECUTE FUNCTION audit_incident_delete();

-- Enforce a deliberate state machine, including a controlled reopen path.
CREATE FUNCTION enforce_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF OLD.status = 'resolved' THEN
    IF NEW.status <> 'investigating' OR current_setting('app.allow_reopen',true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Resolved incidents require reopen_incident()' USING ERRCODE = '23514';
    END IF;
  ELSIF NOT ((OLD.status = 'open' AND NEW.status IN ('investigating','resolved')) OR
             (OLD.status = 'investigating' AND NEW.status IN ('open','resolved'))) THEN
    RAISE EXCEPTION 'Invalid incident status transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER incidents_status_transition BEFORE UPDATE OF status ON incidents
  FOR EACH ROW EXECUTE FUNCTION enforce_status_transition();

-- A volatile clock comparison belongs in a trigger, not a CHECK constraint.
CREATE FUNCTION reject_future_incident() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Incident occurrence cannot be more than 5 minutes in the future'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER incidents_occurrence_time BEFORE INSERT OR UPDATE OF occurred_at ON incidents
  FOR EACH ROW EXECUTE FUNCTION reject_future_incident();

-- Replace the old two-argument function with category-aware resolution.
DROP FUNCTION resolve_incident(uuid,text);
CREATE FUNCTION resolve_incident(p_id uuid,p_root_cause text,p_category_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE current_status incident_status;
BEGIN
  SELECT status INTO current_status FROM incidents WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0001'; END IF;
  IF current_status = 'resolved' THEN RAISE EXCEPTION 'Incident already resolved' USING ERRCODE = 'P0001'; END IF;
  IF nullif(trim(p_root_cause),'') IS NULL THEN RAISE EXCEPTION 'Root cause required' USING ERRCODE = 'P0001'; END IF;
  IF p_category_id IS NULL OR NOT EXISTS (SELECT 1 FROM root_cause_categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Valid root cause category required' USING ERRCODE = 'P0001';
  END IF;
  UPDATE incidents SET status='resolved',root_cause=trim(p_root_cause),
    root_cause_category_id=p_category_id,resolved_at=now() WHERE id=p_id;
END $$;
CREATE FUNCTION reopen_incident(p_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE old_title text;
BEGIN
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reopen reason required' USING ERRCODE='P0001'; END IF;
  SELECT title INTO old_title FROM incidents WHERE id=p_id AND status='resolved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only resolved incidents can be reopened' USING ERRCODE='P0001'; END IF;
  PERFORM set_config('app.allow_reopen','on',true);
  UPDATE incidents SET status='investigating',resolved_at=NULL WHERE id=p_id;
  PERFORM set_config('app.allow_reopen','off',true);
  INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
  VALUES(p_id,old_title,nullif(current_setting('app.current_user_id',true),'')::uuid,
         'reopened',jsonb_build_object('reason',trim(p_reason)));
END $$;

-- Make the indexed expression identical to the application's FTS query.
ALTER TABLE incidents ADD COLUMN search_vector tsvector GENERATED ALWAYS AS
  (to_tsvector('english',title || ' ' || summary || ' ' || coalesce(root_cause,''))) STORED;
CREATE INDEX incidents_search_vector_idx ON incidents USING gin(search_vector);
DROP INDEX incidents_search_idx;
CREATE INDEX incident_symptoms_symptom_idx ON incident_symptoms(symptom_id);

-- Replace summary view with operational risk and freshness metrics.
DROP VIEW service_failure_summary;
CREATE VIEW service_failure_summary AS
SELECT s.id service_id,s.name service_name,count(i.id) incident_count,
  count(i.id) FILTER (WHERE i.status <> 'resolved') active_count,
  count(i.id) FILTER (WHERE i.status <> 'resolved' AND i.severity >= 4) critical_active_count,
  max(i.occurred_at) last_incident_at,round(avg(i.severity)::numeric,2) avg_severity
FROM services s LEFT JOIN incidents i ON i.service_id=s.id GROUP BY s.id,s.name;

-- Give the dashboard category-aware resolution statistics.
CREATE VIEW incident_resolution_stats AS
SELECT s.id service_id,s.name service_name,c.id category_id,c.label category_label,
  count(*) resolution_count,avg(i.resolved_at-i.occurred_at) avg_time_to_resolve
FROM incidents i JOIN services s ON s.id=i.service_id
JOIN root_cause_categories c ON c.id=i.root_cause_category_id
WHERE i.status='resolved'
GROUP BY s.id,s.name,c.id,c.label;
