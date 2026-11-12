import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { pool, withTransaction } from '@/lib/db';
import { HttpError, readJson, route, validated } from '@/lib/http';
import { scheduleGraphSync } from '@/lib/outbox';

const input = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('service'),
    name: z.string().trim().min(2).max(100),
    ownerTeam: z.string().trim().min(2).max(100),
  }),
  z.object({ kind: z.literal('symptom'), label: z.string().trim().min(3).max(100) }),
  z.object({ kind: z.literal('rootCause'), label: z.string().trim().min(3).max(80) }),
  z.object({
    kind: z.literal('dependency'),
    serviceId: z.uuid(),
    dependsOnServiceId: z.uuid(),
  }),
]);
const dependencyInput = z.object({
  kind: z.literal('dependency'),
  serviceId: z.uuid(),
  dependsOnServiceId: z.uuid(),
});

export async function GET() {
  return route(async () => {
    await requireUser('admin');
    const [services, symptoms, categories, dependencies, events] = await Promise.all([
      pool.query('SELECT id,name,owner_team FROM services ORDER BY name'),
      pool.query('SELECT id,label FROM symptoms ORDER BY label'),
      pool.query('SELECT id,label FROM root_cause_categories ORDER BY label'),
      pool.query('SELECT service_id,depends_on_service_id FROM service_dependencies'),
      pool.query(
        `SELECT e.id,e.event_type,e.detail,e.happened_at,e.incident_title,
          u.email AS actor_email
         FROM incident_events e LEFT JOIN users u ON u.id=e.actor_id
         ORDER BY e.happened_at DESC,e.id DESC LIMIT 30`,
      ),
    ]);
    return NextResponse.json({
      services: services.rows,
      symptoms: symptoms.rows,
      categories: categories.rows,
      dependencies: dependencies.rows,
      events: events.rows,
    });
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser('admin');
    const value = validated(input, await readJson(request));
    if (value.kind === 'dependency' && value.serviceId === value.dependsOnServiceId) {
      throw new HttpError(409, 'A service cannot depend on itself');
    }
    const result = await withTransaction(user, async (client) => {
      if (value.kind === 'service') {
        return client.query(
          'INSERT INTO services(name,owner_team) VALUES($1,$2) RETURNING id,name,owner_team',
          [value.name, value.ownerTeam],
        );
      }
      if (value.kind === 'symptom') {
        return client.query('INSERT INTO symptoms(label) VALUES($1) RETURNING id,label', [
          value.label,
        ]);
      }
      if (value.kind === 'rootCause') {
        return client.query(
          'INSERT INTO root_cause_categories(label) VALUES($1) RETURNING id,label',
          [value.label],
        );
      }
      return client.query(
        `INSERT INTO service_dependencies(service_id,depends_on_service_id)
         VALUES($1,$2) RETURNING *`,
        [value.serviceId, value.dependsOnServiceId],
      );
    });
    scheduleGraphSync();
    return NextResponse.json(result.rows[0], { status: 201 });
  });
}

export async function DELETE(request: Request) {
  return route(async () => {
    const user = await requireUser('admin');
    const value = validated(dependencyInput, await readJson(request));
    const deleted = await withTransaction(user, async (client) => {
      const result = await client.query(
        `DELETE FROM service_dependencies WHERE service_id=$1
         AND depends_on_service_id=$2 RETURNING *`,
        [value.serviceId, value.dependsOnServiceId],
      );
      return Boolean(result.rowCount);
    });
    if (!deleted) throw new HttpError(404, 'Dependency not found');
    scheduleGraphSync();
    return NextResponse.json({ ok: true });
  });
}
