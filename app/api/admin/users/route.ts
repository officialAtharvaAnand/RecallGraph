import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireUser } from '@/lib/auth';
import { pool, withTransaction } from '@/lib/db';
import { readJson, route, validated } from '@/lib/http';
import { userInput } from '@/lib/validation';

export async function GET() {
  return route(async () => {
    await requireUser('admin');
    const result = await pool.query(
      'SELECT id,email,role,created_at FROM users ORDER BY created_at,id',
    );
    return NextResponse.json(result.rows);
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const actor = await requireUser('admin');
    const input = validated(userInput, await readJson(request));
    const hash = await bcrypt.hash(input.password, 12);
    const created = await withTransaction(actor, async (client) => {
      const result = await client.query(
        `INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3)
         RETURNING id,email,role,created_at`,
        [input.email, hash, input.role],
      );
      return result.rows[0];
    });
    return NextResponse.json(created, { status: 201 });
  });
}
