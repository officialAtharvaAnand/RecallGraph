import type { Pool } from 'pg';
import type { Driver } from 'neo4j-driver';

export function outboxStatus(pool: Pool): Promise<{
  pending: number;
  failed: number;
  oldest_pending_seconds: number | null;
}>;
export function drainOutbox(
  pool: Pool,
  driver: Driver,
  limit?: number,
): Promise<{
  processed: number;
  pending: number;
  failed: number;
  oldest_pending_seconds: number | null;
}>;
