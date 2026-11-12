import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let actor;
let service;
let symptom;
let category;

before(async () => {
  actor = (await pool.query('SELECT id FROM users WHERE email=$1', [process.env.TEST_ADMIN_EMAIL]))
    .rows[0].id;
  service = (
    await pool.query(
      "INSERT INTO services(name,owner_team) VALUES('Test Checkout','Test Team') RETURNING id",
    )
  ).rows[0].id;
  symptom = (await pool.query("INSERT INTO symptoms(label) VALUES('Test timeout') RETURNING id"))
    .rows[0].id;
  category = (
    await pool.query(
      "SELECT id FROM root_cause_categories WHERE label='Connection pool exhaustion'",
    )
  ).rows[0].id;
});
after(() => pool.end());

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
async function incident(client, overrides = {}) {
  const value = {
    title: 'Test checkout timeout',
    summary: 'Checkout requests timed out under load.',
    serviceId: service,
    severity: 3,
    occurredAt: new Date(Date.now() - 86400000),
    ...overrides,
  };
  return (
    await client.query(
      `INSERT INTO incidents(title,summary,service_id,severity,occurred_at,created_by)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [value.title, value.summary, value.serviceId, value.severity, value.occurredAt, actor],
    )
  ).rows[0].id;
}
async function rejected(sql, params, code) {
  await transaction(async (client) => {
    await assert.rejects(client.query(sql, params), (error) => error.code === code);
  });
}

test('SQL rejects severity 0 and 6', async () => {
  for (const severity of [0, 6]) {
    await transaction(async (client) => {
      await assert.rejects(incident(client, { severity }), (error) => error.code === '23514');
    });
  }
});
test('SQL rejects a title shorter than five characters', async () => {
  await transaction(async (client) => {
    await assert.rejects(incident(client, { title: 'bad' }), (error) => error.code === '23514');
  });
});
test('SQL rejects an unknown service foreign key', async () => {
  await transaction(async (client) => {
    await assert.rejects(
      incident(client, { serviceId: randomUUID() }),
      (error) => error.code === '23503',
    );
  });
});
test('SQL rejects duplicate symptom labels and uppercase email', async () => {
  await rejected('INSERT INTO symptoms(label) VALUES($1)', ['Test timeout'], '23505');
  await rejected(
    'INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3)',
    ['Upper@Example.COM', 'unused-hash', 'analyst'],
    '23514',
  );
});
test('SQL rejects incomplete resolved rows and resolution before occurrence', async () => {
  for (const values of [
    { root: null, categoryId: null, resolvedAt: null },
    { root: 'Known cause', categoryId: null, resolvedAt: new Date() },
    { root: null, categoryId: category, resolvedAt: new Date() },
    { root: 'Known cause', categoryId: category, resolvedAt: new Date(Date.now() - 2 * 86400000) },
  ]) {
    await transaction(async (client) => {
      const id = await incident(client);
      await assert.rejects(
        client.query(
          `UPDATE incidents SET status='resolved',root_cause=$2,
          root_cause_category_id=$3,resolved_at=$4 WHERE id=$1`,
          [id, values.root, values.categoryId, values.resolvedAt],
        ),
        (error) => error.code === '23514',
      );
    });
  }
});
test('SQL rejects occurrence more than five minutes in the future', async () => {
  await transaction(async (client) => {
    await assert.rejects(
      incident(client, { occurredAt: new Date(Date.now() + 3600000) }),
      (error) => error.code === '23514',
    );
  });
});
test('SQL prevents resolved-to-open and permits controlled reopen with audit event', async () => {
  await transaction(async (client) => {
    await client.query("SELECT set_config('app.current_user_id',$1,true)", [actor]);
    const id = await incident(client);
    await client.query('SELECT resolve_incident($1,$2,$3)', [
      id,
      'The pool was exhausted',
      category,
    ]);
    await client.query('SAVEPOINT before_bad_transition');
    await assert.rejects(
      client.query("UPDATE incidents SET status='open' WHERE id=$1", [id]),
      (error) => error.code === '23514',
    );
    await client.query('ROLLBACK TO SAVEPOINT before_bad_transition');
    await client.query('SELECT reopen_incident($1,$2)', [id, 'Follow-up investigation']);
    const result = await client.query('SELECT status FROM incidents WHERE id=$1', [id]);
    assert.equal(result.rows[0].status, 'investigating');
    const events = await client.query(
      "SELECT event_type FROM incident_events WHERE incident_id=$1 AND event_type='reopened'",
      [id],
    );
    assert.equal(events.rowCount, 1);
    await client.query("UPDATE incidents SET status='open' WHERE id=$1", [id]);
  });
});
test('SQL audit trigger records actor for created, status and root cause changes', async () => {
  await transaction(async (client) => {
    await client.query("SELECT set_config('app.current_user_id',$1,true)", [actor]);
    const id = await incident(client);
    await client.query("UPDATE incidents SET status='investigating' WHERE id=$1", [id]);
    await client.query('SELECT resolve_incident($1,$2,$3)', [id, 'Pool saturation', category]);
    const rows = (
      await client.query(
        'SELECT event_type,actor_id FROM incident_events WHERE incident_id=$1 ORDER BY id',
        [id],
      )
    ).rows;
    assert.deepEqual(
      rows.map((row) => row.event_type),
      ['created', 'status_changed', 'status_changed', 'root_cause_updated'],
    );
    assert(rows.every((row) => row.actor_id === actor));
  });
});
test('SQL deletion preserves audit rows and adds deleted event', async () => {
  await transaction(async (client) => {
    await client.query("SELECT set_config('app.current_user_id',$1,true)", [actor]);
    const id = await incident(client);
    await client.query('DELETE FROM incidents WHERE id=$1', [id]);
    const rows = (
      await client.query(
        'SELECT event_type,actor_id FROM incident_events WHERE incident_id=$1 ORDER BY id',
        [id],
      )
    ).rows;
    assert.deepEqual(
      rows.map((row) => row.event_type),
      ['created', 'deleted'],
    );
    assert.equal(rows[1].actor_id, actor);
  });
});
test('SQL resolve_incident failure is atomic', async () => {
  await transaction(async (client) => {
    const id = await incident(client);
    await client.query('SAVEPOINT before_bad_resolve');
    await assert.rejects(
      client.query('SELECT resolve_incident($1,$2,$3)', [id, 'Cause', randomUUID()]),
      (error) => error.code === 'P0001',
    );
    await client.query('ROLLBACK TO SAVEPOINT before_bad_resolve');
    const row = (
      await client.query('SELECT status,root_cause,resolved_at FROM incidents WHERE id=$1', [id])
    ).rows[0];
    assert.equal(row.status, 'open');
    assert.equal(row.root_cause, null);
    assert.equal(row.resolved_at, null);
  });
});
test('SQL transaction rollback removes incident and outbox after bad symptom link', async () => {
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO incidents(id,title,summary,service_id,severity,occurred_at,created_by)
       VALUES($1,'Rollback test','This incident must roll back',$2,3,now(),$3)`,
      [id, service, actor],
    );
    await assert.rejects(
      client.query('INSERT INTO incident_symptoms VALUES($1,$2)', [id, randomUUID()]),
      (error) => error.code === '23503',
    );
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
  assert.equal((await pool.query('SELECT 1 FROM incidents WHERE id=$1', [id])).rowCount, 0);
  assert.equal(
    (await pool.query("SELECT 1 FROM graph_outbox WHERE payload->>'id'=$1", [id])).rowCount,
    0,
  );
});
test('SQL full-text search finds root cause and ranks title match higher', async () => {
  await transaction(async (client) => {
    const first = await incident(client, { title: 'Database saturation at checkout' });
    const second = await incident(client, { title: 'Database connection issue' });
    await client.query('SELECT resolve_incident($1,$2,$3)', [
      first,
      'A rare saturation pattern',
      category,
    ]);
    await client.query('SELECT resolve_incident($1,$2,$3)', [
      second,
      'Saturation observed',
      category,
    ]);
    const result = await client.query(
      `SELECT id,ts_rank(search_vector,plainto_tsquery('english','saturation')) AS rank
       FROM incidents WHERE id=ANY($1::uuid[]) AND
       search_vector @@ plainto_tsquery('english','saturation') ORDER BY rank DESC`,
      [[first, second]],
    );
    assert.equal(result.rowCount, 2);
    assert.equal(result.rows[0].id, first);
    assert(Number(result.rows[0].rank) > Number(result.rows[1].rank));
  });
});
test('SQL summary and resolution views match manual counts and average', async () => {
  await transaction(async (client) => {
    const id = await incident(client);
    await client.query('SELECT resolve_incident($1,$2,$3)', [id, 'Pool saturation', category]);
    const summary = (
      await client.query('SELECT incident_count FROM service_failure_summary WHERE service_id=$1', [
        service,
      ])
    ).rows[0];
    const manual = (
      await client.query('SELECT count(*)::int AS n FROM incidents WHERE service_id=$1', [service])
    ).rows[0];
    assert.equal(Number(summary.incident_count), manual.n);
    const view = (
      await client.query(
        `SELECT extract(epoch FROM avg_time_to_resolve) AS seconds
       FROM incident_resolution_stats WHERE service_id=$1 AND category_id=$2`,
        [service, category],
      )
    ).rows[0];
    const calculation = (
      await client.query(
        `SELECT avg(extract(epoch FROM resolved_at-occurred_at)) AS seconds
       FROM incidents WHERE service_id=$1 AND root_cause_category_id=$2 AND status='resolved'`,
        [service, category],
      )
    ).rows[0];
    assert(Math.abs(Number(view.seconds) - Number(calculation.seconds)) < 0.01);
  });
});
test('SQL service dependencies reject self edges and two-cycles', async () => {
  await transaction(async (client) => {
    const other = (
      await client.query(
        "INSERT INTO services(name,owner_team) VALUES('Test Upstream','Test Team') RETURNING id",
      )
    ).rows[0].id;
    await client.query('SAVEPOINT self_edge');
    await assert.rejects(
      client.query('INSERT INTO service_dependencies VALUES($1,$1)', [service]),
      (error) => error.code === '23514',
    );
    await client.query('ROLLBACK TO SAVEPOINT self_edge');
    await client.query('INSERT INTO service_dependencies VALUES($1,$2)', [service, other]);
    await client.query('SAVEPOINT cycle');
    await assert.rejects(
      client.query('INSERT INTO service_dependencies VALUES($1,$2)', [other, service]),
      (error) => error.code === '23514',
    );
    await client.query('ROLLBACK TO SAVEPOINT cycle');
  });
});
