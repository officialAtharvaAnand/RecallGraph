import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { HttpError, readJson, route, validated } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };
const roleInput = z.object({ role: z.enum(['admin', 'analyst']) });

export async function PATCH(request: Request, context: Context) {
  return route(async () => {
    const actor = await requireUser('admin');
    const id = validated(z.uuid(), (await context.params).id);
    const { role } = validated(roleInput, await readJson(request));
    const result = await withTransaction(actor, async (client) => {
      // Lock admins so concurrent demotions cannot leave the project without one.
      await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      const target = await client.query('SELECT role FROM users WHERE id=$1', [id]);
      if (!target.rowCount) throw new HttpError(404, 'User not found');
      if (id === actor.id && role === 'analyst') {
        const count = await client.query("SELECT count(*)::int AS n FROM users WHERE role='admin'");
        if (count.rows[0].n === 1) throw new HttpError(409, 'Cannot demote the only admin');
      }
      const changed = await client.query(
        `UPDATE users SET role=$2,token_version=token_version+1 WHERE id=$1
         RETURNING id,email,role,created_at`,
        [id, role],
      );
      return changed.rows[0];
    });
    return NextResponse.json(result);
  });
}
