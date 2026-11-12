import { NextResponse } from 'next/server';
import { pool, graphQuery } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { symptomCooccurrence } from '@/lib/graph';
export async function GET() {
  return route(async () => {
    await requireUser();
    const [summary, repeat, symptoms, categories, resolutionStats] = await Promise.all([
      pool.query('SELECT * FROM service_failure_summary ORDER BY incident_count DESC'),
      pool.query(
        `SELECT s.name service_name,count(*) failures,max(i.occurred_at) latest FROM incidents i JOIN services s ON s.id=i.service_id WHERE i.occurred_at>now()-interval '90 days' GROUP BY s.name HAVING count(*)>=2 ORDER BY failures DESC`,
      ),
      pool.query('SELECT id,label FROM symptoms ORDER BY label'),
      pool.query('SELECT id,label FROM root_cause_categories ORDER BY label'),
      pool.query(`SELECT service_name, category_label, resolution_count,
        round((extract(epoch FROM avg_time_to_resolve) / 3600)::numeric, 1)::float
          AS avg_time_to_resolve_hours
        FROM incident_resolution_stats ORDER BY resolution_count DESC`),
    ]);
    let patterns: unknown[] = [];
    let cooccurrence: unknown[] = [];
    let graphAvailable = true;
    try {
      [patterns, cooccurrence] = await Promise.all([
        graphQuery(
          'MATCH (a:Incident)-[:EXHIBITS]->(s:Symptom)<-[:EXHIBITS]-(b:Incident) WHERE a.id < b.id RETURN a.id AS first,b.id AS second,count(s) AS sharedSymptoms ORDER BY sharedSymptoms DESC LIMIT 10',
        ),
        symptomCooccurrence(),
      ]);
    } catch (e) {
      console.error('Graph insight unavailable', e);
      graphAvailable = false;
    }
    return NextResponse.json({
      summary: summary.rows,
      repeat: repeat.rows,
      symptoms: symptoms.rows,
      categories: categories.rows,
      resolutionStats: resolutionStats.rows,
      patterns,
      symptomCooccurrence: cooccurrence,
      graphAvailable,
    });
  });
}
