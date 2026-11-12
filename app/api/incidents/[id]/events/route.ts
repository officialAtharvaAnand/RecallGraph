import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { pool } from '@/lib/db';
import { route, validated } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return route(async () => {
    await requireUser();
    const id = validated(z.uuid(), (await context.params).id);
    const result = await pool.query(
      `SELECT e.id,e.event_type,e.detail,e.happened_at,e.incident_title,
        u.email AS actor_email
       FROM incident_events e LEFT JOIN users u ON u.id=e.actor_id
       WHERE e.incident_id=$1 ORDER BY e.happened_at,e.id`,
      [id],
    );
    return NextResponse.json(result.rows);
  });
}
