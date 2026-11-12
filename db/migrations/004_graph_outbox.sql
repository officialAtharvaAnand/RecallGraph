-- The outbox commits with SQL changes, so graph work can be retried after an outage.
CREATE TABLE graph_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  op text NOT NULL CHECK (op IN (
    'upsert_incident','delete_incident','upsert_service','upsert_symptom',
    'upsert_root_cause','set_dependency','remove_dependency'
  )),
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX graph_outbox_pending_idx ON graph_outbox(id) WHERE processed_at IS NULL;

-- Triggers cover API writes, scripts, and direct SQL alike.
CREATE FUNCTION enqueue_graph_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE incident_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'incidents' THEN
    INSERT INTO graph_outbox(op,payload) VALUES(
      CASE WHEN TG_OP='DELETE' THEN 'delete_incident' ELSE 'upsert_incident' END,
      jsonb_build_object('id',CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END));
  ELSIF TG_TABLE_NAME = 'incident_symptoms' THEN
    incident_id := CASE WHEN TG_OP='DELETE' THEN OLD.incident_id ELSE NEW.incident_id END;
    INSERT INTO graph_outbox(op,payload) VALUES('upsert_incident',jsonb_build_object('id',incident_id));
  ELSIF TG_TABLE_NAME = 'services' THEN
    IF TG_OP <> 'DELETE' THEN
      INSERT INTO graph_outbox(op,payload) VALUES('upsert_service',jsonb_build_object('id',NEW.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'symptoms' THEN
    IF TG_OP <> 'DELETE' THEN
      INSERT INTO graph_outbox(op,payload) VALUES('upsert_symptom',jsonb_build_object('id',NEW.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'root_cause_categories' THEN
    IF TG_OP <> 'DELETE' THEN
      INSERT INTO graph_outbox(op,payload) VALUES('upsert_root_cause',jsonb_build_object('id',NEW.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'service_dependencies' THEN
    INSERT INTO graph_outbox(op,payload) VALUES(
      CASE WHEN TG_OP='DELETE' THEN 'remove_dependency' ELSE 'set_dependency' END,
      jsonb_build_object('serviceId',CASE WHEN TG_OP='DELETE' THEN OLD.service_id ELSE NEW.service_id END,
        'dependsOnServiceId',CASE WHEN TG_OP='DELETE' THEN OLD.depends_on_service_id ELSE NEW.depends_on_service_id END));
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER graph_incidents AFTER INSERT OR UPDATE OR DELETE ON incidents
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_change();
CREATE TRIGGER graph_incident_symptoms AFTER INSERT OR DELETE ON incident_symptoms
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_change();
CREATE TRIGGER graph_services AFTER INSERT OR UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_change();
CREATE TRIGGER graph_symptoms AFTER INSERT OR UPDATE ON symptoms
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_change();
CREATE TRIGGER graph_root_causes AFTER INSERT OR UPDATE ON root_cause_categories
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_change();
CREATE TRIGGER graph_dependencies AFTER INSERT OR DELETE ON service_dependencies
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_change();
