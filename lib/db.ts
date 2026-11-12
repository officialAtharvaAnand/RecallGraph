import { Pool, type PoolClient } from 'pg';
import neo4j from 'neo4j-driver';
import { withTransaction as transaction } from './transaction-core.mjs';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const globalDb = globalThis as unknown as {
  pool?: Pool;
  driver?: ReturnType<typeof neo4j.driver>;
};

// Validate every setting even when development hot reload reuses a connection.
const databaseUrl = requireEnv('DATABASE_URL');
const neo4jUri = requireEnv('NEO4J_URI');
const neo4jUser = requireEnv('NEO4J_USER');
const neo4jPassword = requireEnv('NEO4J_PASSWORD');

export const pool = globalDb.pool ?? new Pool({ connectionString: databaseUrl });
export const driver =
  globalDb.driver ?? neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword));

if (process.env.NODE_ENV !== 'production') {
  globalDb.pool = pool;
  globalDb.driver = driver;
}

export async function withTransaction<T>(
  user: { id: string },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return transaction(pool, user, fn);
}

export async function graphQuery<T>(
  query: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session = driver.session();
  try {
    const result = await session.run(query, params);
    return result.records.map(
      (record) =>
        Object.fromEntries(
          record.keys.map((key) => {
            const value = record.get(key);
            return [key, neo4j.isInt(value) ? value.toNumber() : value];
          }),
        ) as T,
    );
  } finally {
    await session.close();
  }
}
