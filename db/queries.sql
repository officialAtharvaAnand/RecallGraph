-- Full-text search uses the generated, indexed vector.
SELECT id, title, ts_rank(search_vector, plainto_tsquery('english', 'connection pool')) AS rank
FROM incidents
WHERE search_vector @@ plainto_tsquery('english', 'connection pool')
ORDER BY rank DESC;

-- Grouped failures with a threshold.
SELECT s.name, count(*) AS failures, round(avg(i.severity), 2) AS avg_severity
FROM services s JOIN incidents i ON i.service_id = s.id
GROUP BY s.id HAVING count(*) >= 2 ORDER BY failures DESC;

-- Correlated subquery: incidents above their service's average severity.
SELECT i.title, i.severity FROM incidents i
WHERE i.severity > (SELECT avg(j.severity) FROM incidents j WHERE j.service_id = i.service_id);

-- Uncorrelated subquery: services with open incidents.
SELECT name FROM services WHERE id IN
  (SELECT service_id FROM incidents WHERE status = 'open');

-- CTE: recent failures per service.
WITH recent AS (SELECT service_id FROM incidents WHERE occurred_at >= now() - interval '90 days')
SELECT s.name, count(*) AS recent_failures FROM recent r
JOIN services s ON s.id = r.service_id GROUP BY s.id ORDER BY recent_failures DESC;

-- Window function: rank severe incidents within each service.
SELECT title, service_id, severity,
  dense_rank() OVER (PARTITION BY service_id ORDER BY severity DESC) AS severity_rank
FROM incidents ORDER BY service_id, severity_rank;

SELECT * FROM service_failure_summary ORDER BY critical_active_count DESC;
SELECT * FROM incident_resolution_stats ORDER BY resolution_count DESC;

-- Exercise both stored functions without retaining demonstration changes.
BEGIN;
DO $$ DECLARE target uuid; category uuid; BEGIN
  SELECT id INTO target FROM incidents WHERE status <> 'resolved' ORDER BY created_at LIMIT 1;
  SELECT id INTO category FROM root_cause_categories WHERE label = 'Uncategorised';
  IF target IS NOT NULL THEN
    PERFORM resolve_incident(target, 'Demonstration root cause', category);
    PERFORM reopen_incident(target, 'Demonstration follow-up');
  END IF;
END $$;
ROLLBACK;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM incidents WHERE search_vector @@ plainto_tsquery('english', 'connection pool');
