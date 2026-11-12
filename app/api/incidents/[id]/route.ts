import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool, withTransaction } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { HttpError, readJson, route, validated } from '@/lib/http';
import { updateInput } from '@/lib/validation';
import { scheduleGraphSync } from '@/lib/outbox';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return route(async () => {
    const user = await requireUser();
    const id = validated(z.uuid(), (await context.params).id);
    const input = validated(updateInput, await readJson(request));
    const incident = await withTransaction(user, async (client) => {
      if (input.status === 'resolved') {
        // The database function validates the category and performs the atomic transition.
        await client.query('SELECT resolve_incident($1,$2,$3)', [
          id,
          input.rootCause,
          input.categoryId,
        ]);
      } else {
        const changed = await client.query(
          'UPDATE incidents SET status=$2 WHERE id=$1 RETURNING id',
          [id, input.status],
        );
        if (!changed.rowCount) throw new HttpError(404, 'Incident not found');
      }
      return (await client.query('SELECT * FROM incidents WHERE id=$1', [id])).rows[0];
    });
    scheduleGraphSync();
    return NextResponse.json(incident);
  });
}

export async function DELETE(_request: Request, context: Context) {
  return route(async () => {
    const user = await requireUser('admin');
    const id = validated(z.uuid(), (await context.params).id);
    const deleted = await withTransaction(user, async (client) => {
      const result = await client.query('DELETE FROM incidents WHERE id=$1 RETURNING id', [id]);
      return Boolean(result.rowCount);
    });
    if (!deleted) throw new HttpError(404, 'Incident not found');
    scheduleGraphSync();
    return NextResponse.json({ ok: true });
  });
}
