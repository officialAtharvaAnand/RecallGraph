import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, validated } from '@/lib/http';
import { pool } from '@/lib/db';
import { likelyRootCauses, upstreamSuspects, similarIncidents } from '@/lib/graph';

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return route(async () => {
    await requireUser();
    const id = validated(z.uuid(), (await context.params).id);
    const incident = (await pool.query('SELECT id,title,status FROM incidents WHERE id=$1', [id]))
      .rows[0];
    if (!incident) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    try {
      const [likely, upstream, similar] = await Promise.all([
        likelyRootCauses(id),
        upstreamSuspects(id),
        similarIncidents(id),
      ]);
      return NextResponse.json({
        incident,
        likelyRootCauses: likely,
        upstreamSuspects: upstream,
        similar,
        graphAvailable: true,
      });
    } catch (error) {
      console.error('Graph insights unavailable', error);
      return NextResponse.json({
        incident,
        likelyRootCauses: [],
        upstreamSuspects: [],
        similar: [],
        graphAvailable: false,
      });
    }
  });
}
