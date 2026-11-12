import { NextResponse } from 'next/server';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Malformed JSON body');
  }
}

export function validated<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((issue) => issue.message).join('; '));
  }
  return result.data;
}

export function handleError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const databaseError = error as { code?: string; message?: string };
  const code = databaseError?.code;
  if (code === '23505') {
    return NextResponse.json({ error: 'A record with that value already exists' }, { status: 409 });
  }
  if (code === '23503') {
    return NextResponse.json(
      { error: 'A referenced record does not exist or is in use' },
      { status: 409 },
    );
  }
  if (code === '23514' || code === '22P02') {
    return NextResponse.json({ error: 'The supplied value violates a data rule' }, { status: 400 });
  }
  if (code === 'P0001') {
    const message = databaseError.message ?? 'The requested operation is not allowed';
    const status = /already|only resolved|not found/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
  console.error('Unhandled route error', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function route<T extends Response>(fn: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (error) {
    return handleError(error);
  }
}
