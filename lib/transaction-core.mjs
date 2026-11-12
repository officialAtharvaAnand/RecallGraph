/**
 * Shared SQL write boundary for Route Handlers and synthetic seed imports.
 * The actor is transaction-local so a pooled connection cannot leak identities.
 */
export async function withTransaction(pool, user, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [user.id]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
