/**
 * These queries traverse relationships rather than joining fixed tables.
 * Blast radius and upstream suspects need variable-length dependency paths;
 * root-cause evidence and symptom co-occurrence follow multiple graph edges.
 * In SQL, each changing path length would require recursive CTEs or many joins.
 */
import { graphQuery } from './db';
import neo4j from 'neo4j-driver';

export async function blastRadius(serviceId: string, maxDepth = 3) {
  return graphQuery<{ id: string; name: string; depth: number; recentIncidents: number }>(
    `MATCH path=(s:Service {id:$id})<-[:DEPENDS_ON*1..3]-(dependent:Service)
     WITH dependent,min(length(path)) AS depth
     WHERE depth <= $maxDepth
     OPTIONAL MATCH (incident:Incident)-[:AFFECTS]->(dependent)
     WHERE incident.occurredAt >= $since
     RETURN dependent.id AS id,dependent.name AS name,depth,
       count(DISTINCT incident) AS recentIncidents ORDER BY depth,name`,
    { id: serviceId, maxDepth, since: Date.now() - 90 * 86400000 },
  );
}

export async function likelyRootCauses(incidentId: string) {
  return graphQuery<{
    id: string;
    label: string;
    supportingIncidents: number;
    sharedSymptoms: number;
  }>(
    `MATCH (target:Incident {id:$id})-[:EXHIBITS]->(symptom:Symptom)
       <-[:EXHIBITS]-(other:Incident)-[:CAUSED_BY]->(cause:RootCause)
     WHERE other.id <> $id
     RETURN cause.id AS id,cause.label AS label,
       count(DISTINCT other) AS supportingIncidents,
       count(DISTINCT symptom) AS sharedSymptoms
     ORDER BY supportingIncidents DESC,sharedSymptoms DESC,label`,
    { id: incidentId },
  );
}

export async function upstreamSuspects(incidentId: string, windowHours = 6) {
  // Direction matters: a service points to the service it depends on.
  return graphQuery<{ id: string; title: string; service: string; depth: number }>(
    `MATCH (target:Incident {id:$id})-[:AFFECTS]->(service:Service)
     MATCH path=(service)-[:DEPENDS_ON*1..3]->(upstream:Service)
     MATCH (other:Incident)-[:AFFECTS]->(upstream)
     WHERE other.occurredAt <= target.occurredAt
       AND other.occurredAt >= target.occurredAt - $windowMs
       AND other.id <> target.id
     RETURN other.id AS id,other.title AS title,upstream.name AS service,
       min(length(path)) AS depth ORDER BY depth,other.title`,
    { id: incidentId, windowMs: windowHours * 3600000 },
  );
}

export async function symptomCooccurrence(limit = 15) {
  return graphQuery<{ first: string; second: string; incidents: number }>(
    `MATCH (first:Symptom)<-[:EXHIBITS]-(incident:Incident)-[:EXHIBITS]->(second:Symptom)
     WHERE first.id < second.id
     RETURN first.label AS first,second.label AS second,
       count(DISTINCT incident) AS incidents ORDER BY incidents DESC LIMIT $limit`,
    { limit: neo4j.int(limit) },
  );
}

export async function similarIncidents(incidentId: string) {
  return graphQuery<{ id: string; sharedSymptoms: number; sharedLabels: string[] }>(
    `MATCH (target:Incident {id:$id})-[:EXHIBITS]->(symptom:Symptom)
       <-[:EXHIBITS]-(other:Incident)
     WHERE other.id <> $id
     RETURN other.id AS id,count(DISTINCT symptom) AS sharedSymptoms,
       collect(DISTINCT symptom.label) AS sharedLabels
     ORDER BY sharedSymptoms DESC LIMIT 30`,
    { id: incidentId },
  );
}
