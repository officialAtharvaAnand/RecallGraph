import type { Pool, PoolClient } from 'pg';

export function withTransaction<T>(
  pool: Pool,
  user: { id: string },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T>;
