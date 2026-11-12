import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { readJson, route, validated } from '@/lib/http';
import { scheduleGraphSync } from '@/lib/outbox';
import { reopenInput } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return route(async () => {
    const user = await requireUser('admin');
    const id = validated(z.uuid(), (await context.params).id);
    const { reason } = validated(reopenInput, await readJson(request));
    await withTransaction(user, (client) =>
      client.query('SELECT reopen_incident($1,$2)', [id, reason]).then(() => undefined),
    );
    scheduleGraphSync();
    return NextResponse.json({ ok: true });
  });
}
