import { driver, pool } from './db';
import { drainOutbox as drain, outboxStatus as status } from './outbox-core.mjs';

export function outboxStatus() {
  return status(pool);
}

export async function drainOutbox(limit = 50) {
  try {
    return await drain(pool, driver, limit);
  } catch (error) {
    console.error('Outbox drain failed', error);
    return { processed: 0, pending: -1, failed: -1, oldest_pending_seconds: null };
  }
}

export function scheduleGraphSync() {
  void drainOutbox().catch((error) => console.error('Background graph sync failed', error));
}
