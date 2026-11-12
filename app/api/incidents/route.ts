import { NextResponse } from 'next/server';
import { pool, withTransaction } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { HttpError, readJson, route, validated } from '@/lib/http';
import { incidentFilters, incidentInput } from '@/lib/validation';
import { scheduleGraphSync } from '@/lib/outbox';

export async function GET(request: Request) {
  return route(async () => {
    await requireUser();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const filters = validated(incidentFilters, params);
    const where = `WHERE ($1 = '' OR i.search_vector @@ plainto_tsquery('english', $1))
      AND ($2::incident_status IS NULL OR i.status = $2::incident_status)
      AND ($3::uuid IS NULL OR i.service_id = $3::uuid)
      AND i.severity BETWEEN $4 AND $5`;
    const args = [
      filters.q,
      filters.status ?? null,
      filters.service ?? null,
      filters.minSeverity,
      filters.maxSeverity,
    ];
    const [count, rows] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total FROM incidents i ${where}`, args),
      pool.query(
        `SELECT i.*, s.name AS service_name, c.label AS category_label,
          coalesce(array_agg(sy.label ORDER BY sy.label)
            FILTER (WHERE sy.id IS NOT NULL), '{}') AS symptoms
        FROM incidents i
        JOIN services s ON s.id = i.service_id
        LEFT JOIN root_cause_categories c ON c.id = i.root_cause_category_id
        LEFT JOIN incident_symptoms link ON link.incident_id = i.id
        LEFT JOIN symptoms sy ON sy.id = link.symptom_id
        ${where}
        GROUP BY i.id, s.name, c.label
        ORDER BY i.occurred_at DESC, i.id DESC LIMIT $6 OFFSET $7`,
        [...args, filters.limit, filters.offset],
      ),
    ]);
    return NextResponse.json({ items: rows.rows, total: count.rows[0].total });
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const input = validated(incidentInput, await readJson(request));
    const id = await withTransaction(user, async (client) => {
      const result = await client.query(
        `INSERT INTO incidents(title,summary,service_id,severity,occurred_at,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [input.title, input.summary, input.serviceId, input.severity, input.occurredAt, user.id],
      );
      const incidentId: string = result.rows[0].id;
      for (const symptomId of input.symptoms) {
        await client.query('INSERT INTO incident_symptoms(incident_id,symptom_id) VALUES($1,$2)', [
          incidentId,
          symptomId,
        ]);
      }
      return incidentId;
    });
    scheduleGraphSync();
    if (!id) throw new HttpError(500, 'Incident creation failed');
    return NextResponse.json({ id }, { status: 201 });
  });
}
