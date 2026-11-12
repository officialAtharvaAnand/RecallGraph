import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { drainOutbox, outboxStatus } from '@/lib/outbox';

export async function GET() {
  return route(async () => {
    await requireUser('admin');
    return NextResponse.json(await outboxStatus());
  });
}

export async function POST() {
  return route(async () => {
    await requireUser('admin');
    return NextResponse.json(await drainOutbox(100));
  });
}
