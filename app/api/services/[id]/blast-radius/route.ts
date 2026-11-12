import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, validated } from '@/lib/http';
import { pool } from '@/lib/db';
import { blastRadius } from '@/lib/graph';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return route(async () => {
    await requireUser();
    const id = validated(z.uuid(), (await context.params).id);
    const depth = Number(new URL(request.url).searchParams.get('depth') ?? 3);
    if (!Number.isInteger(depth) || depth < 1 || depth > 3)
      return NextResponse.json({ error: 'depth must be 1, 2, or 3' }, { status: 400 });
    const service = (await pool.query('SELECT id,name FROM services WHERE id=$1', [id])).rows[0];
    if (!service) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    try {
      return NextResponse.json({
        service,
        impacted: await blastRadius(id, depth),
        graphAvailable: true,
      });
    } catch (error) {
      console.error('Blast radius unavailable', error);
      return NextResponse.json({ service, impacted: [], graphAvailable: false });
    }
  });
}
