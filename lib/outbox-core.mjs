/**
 * Shared graph projector for the web application and the bulk seed.
 * PostgreSQL outbox rows remain pending when Neo4j cannot accept a change.
 */
export async function outboxStatus(pool) {
  const result =
    await pool.query(`SELECT count(*) FILTER (WHERE processed_at IS NULL)::int AS pending,
    count(*) FILTER (WHERE processed_at IS NULL AND attempts>0)::int AS failed,
    extract(epoch FROM now()-min(created_at) FILTER (WHERE processed_at IS NULL))::int
      AS oldest_pending_seconds FROM graph_outbox`);
  return result.rows[0];
}

async function project(pool, driver, row) {
  const session = driver.session();
  const { op, payload } = row;
  try {
    await session.executeWrite(async (tx) => {
      if (op === 'delete_incident') {
        await tx.run('MATCH (i:Incident {id:$id}) DETACH DELETE i', { id: payload.id });
        return;
      }
      if (['delete_service', 'delete_symptom', 'delete_root_cause'].includes(op)) {
        const label =
          op === 'delete_service' ? 'Service' : op === 'delete_symptom' ? 'Symptom' : 'RootCause';
        await tx.run(`MATCH (n:${label} {id:$id}) DETACH DELETE n`, { id: payload.id });
        return;
      }
      if (op === 'upsert_incident') {
        const incident = (
          await pool.query(
            `SELECT i.id,i.title,i.severity,i.status,i.occurred_at,i.service_id,
            i.root_cause_category_id,s.name AS service_name,c.label AS cause_label
           FROM incidents i JOIN services s ON s.id=i.service_id
           LEFT JOIN root_cause_categories c ON c.id=i.root_cause_category_id
           WHERE i.id=$1`,
            [payload.id],
          )
        ).rows[0];
        if (!incident) {
          await tx.run('MATCH (i:Incident {id:$id}) DETACH DELETE i', { id: payload.id });
          return;
        }
        const symptoms = (
          await pool.query(
            `SELECT s.id,s.label FROM incident_symptoms link
           JOIN symptoms s ON s.id=link.symptom_id WHERE link.incident_id=$1`,
            [incident.id],
          )
        ).rows;
        await tx.run(
          `MERGE (i:Incident {id:$id})
           SET i.title=$title,i.severity=$severity,i.occurredAt=$occurredAt
           WITH i OPTIONAL MATCH (i)-[edge:EXHIBITS|AFFECTS|CAUSED_BY]->()
           DELETE edge`,
          {
            id: incident.id,
            title: incident.title,
            severity: incident.severity,
            occurredAt: new Date(incident.occurred_at).getTime(),
          },
        );
        await tx.run(
          `MERGE (i:Incident {id:$id}) MERGE (s:Service {id:$serviceId})
           SET s.name=$serviceName MERGE (i)-[:AFFECTS]->(s)`,
          { id: incident.id, serviceId: incident.service_id, serviceName: incident.service_name },
        );
        for (const symptom of symptoms) {
          await tx.run(
            `MERGE (i:Incident {id:$id}) MERGE (s:Symptom {id:$symptomId})
             SET s.label=$label MERGE (i)-[:EXHIBITS]->(s)`,
            { id: incident.id, symptomId: symptom.id, label: symptom.label },
          );
        }
        if (incident.status === 'resolved' && incident.root_cause_category_id) {
          await tx.run(
            `MERGE (i:Incident {id:$id}) MERGE (r:RootCause {id:$causeId})
             SET r.label=$label MERGE (i)-[:CAUSED_BY]->(r)`,
            {
              id: incident.id,
              causeId: incident.root_cause_category_id,
              label: incident.cause_label,
            },
          );
        }
        return;
      }
      if (['upsert_service', 'upsert_symptom', 'upsert_root_cause'].includes(op)) {
        const table =
          op === 'upsert_service'
            ? 'services'
            : op === 'upsert_symptom'
              ? 'symptoms'
              : 'root_cause_categories';
        const label =
          op === 'upsert_service' ? 'Service' : op === 'upsert_symptom' ? 'Symptom' : 'RootCause';
        const field = label === 'Service' ? 'name' : 'label';
        const value = (
          await pool.query(`SELECT id,${field} AS label FROM ${table} WHERE id=$1`, [payload.id])
        ).rows[0];
        if (value) {
          await tx.run(`MERGE (n:${label} {id:$id}) SET n.${field}=$value`, {
            id: value.id,
            value: value.label,
          });
        }
        return;
      }
      const edge = { serviceId: payload.serviceId, dependsOnServiceId: payload.dependsOnServiceId };
      if (op === 'remove_dependency') {
        await tx.run(
          `MATCH (a:Service {id:$serviceId})-[r:DEPENDS_ON]->
          (b:Service {id:$dependsOnServiceId}) DELETE r`,
          edge,
        );
      } else if (op === 'set_dependency') {
        await tx.run(
          `MERGE (a:Service {id:$serviceId})
          MERGE (b:Service {id:$dependsOnServiceId}) MERGE (a)-[:DEPENDS_ON]->(b)`,
          edge,
        );
      }
    });
  } finally {
    await session.close();
  }
}

export async function drainOutbox(pool, driver, limit = 50) {
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // A second worker skips this row instead of waiting on its transaction lock.
      const result = await client.query(`SELECT id,op,payload FROM graph_outbox
        WHERE processed_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const row = result.rows[0];
      if (!row) {
        await client.query('COMMIT');
        break;
      }
      try {
        await project(pool, driver, row);
        await client.query(
          'UPDATE graph_outbox SET processed_at=now(),last_error=NULL WHERE id=$1',
          [row.id],
        );
        processed++;
      } catch (error) {
        await client.query(
          'UPDATE graph_outbox SET attempts=attempts+1,last_error=$2 WHERE id=$1',
          [row.id, String(error)],
        );
        await client.query('COMMIT');
        break;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return { processed, ...(await outboxStatus(pool)) };
}
