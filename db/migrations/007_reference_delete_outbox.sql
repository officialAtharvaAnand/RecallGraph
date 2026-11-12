-- Seed reset and admin maintenance must remove stale graph reference nodes.
ALTER TABLE graph_outbox DROP CONSTRAINT graph_outbox_op_check;
ALTER TABLE graph_outbox ADD CONSTRAINT graph_outbox_op_check CHECK (op IN (
  'upsert_incident','delete_incident','upsert_service','delete_service',
  'upsert_symptom','delete_symptom','upsert_root_cause','delete_root_cause',
  'set_dependency','remove_dependency'
));

CREATE FUNCTION enqueue_graph_reference_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO graph_outbox(op,payload) VALUES (
    CASE TG_TABLE_NAME
      WHEN 'services' THEN 'delete_service'
      WHEN 'symptoms' THEN 'delete_symptom'
      ELSE 'delete_root_cause'
    END,
    jsonb_build_object('id', OLD.id)
  );
  RETURN OLD;
END $$;
CREATE TRIGGER graph_services_delete AFTER DELETE ON services
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_reference_delete();
CREATE TRIGGER graph_symptoms_delete AFTER DELETE ON symptoms
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_reference_delete();
CREATE TRIGGER graph_root_causes_delete AFTER DELETE ON root_cause_categories
  FOR EACH ROW EXECUTE FUNCTION enqueue_graph_reference_delete();
