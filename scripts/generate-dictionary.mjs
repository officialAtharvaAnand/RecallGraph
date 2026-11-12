import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { requireEnv } from './require-env.mjs';

const client = new pg.Client({ connectionString: requireEnv('DATABASE_URL') });
const tablePurpose = {
  users: 'Account, role, and session version.',
  services: 'Tracked service and ownership.',
  incidents: 'Canonical failure and resolution record.',
  incident_events: 'Durable audit event retained after deletion.',
  symptoms: 'Controlled symptom vocabulary.',
  incident_symptoms: 'Incident-to-symptom many-to-many link.',
  root_cause_categories: 'Controlled cause vocabulary.',
  service_dependencies: 'Directed service dependency.',
  graph_outbox: 'Retryable graph projection queue.',
  schema_migrations: 'Applied schema versions.',
  synthetic_seed_rows: 'Bulk-seed reference ownership.',
  synthetic_seed_edges: 'Bulk-seed dependency ownership.',
};
const special = {
  id: 'Stable identifier.',
  password_hash: 'bcrypt password hash, never plaintext.',
  token_version: 'Incremented to revoke sessions.',
  incident_title: 'Title snapshot retained after deletion.',
  actor_id: 'User responsible for the audit event.',
  search_vector: 'Generated and indexed full-text document.',
  synthetic_seed: 'Marker for safe synthetic reset.',
  payload: 'Identifiers for a queued graph change.',
  attempts: 'Failed projection attempts.',
  last_error: 'Last graph projection error.',
  processed_at: 'Successful graph projection time.',
};
const esc = (value) =>
  String(value ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
try {
  await client.connect();
  const columns = (
    await client.query(
      'SELECT c.relname AS table_name,a.attname AS column_name,' +
        'format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull AS required,' +
        'pg_get_expr(d.adbin,d.adrelid) AS default_value ' +
        'FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace ' +
        'JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ' +
        'LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum ' +
        "WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname,a.attnum",
    )
  ).rows;
  const constraints = (
    await client.query(
      'SELECT t.relname AS table_name,c.conname,c.contype,' +
        'pg_get_constraintdef(c.oid) AS definition,' +
        'array(SELECT a.attname FROM unnest(c.conkey) AS k ' +
        'JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k) AS columns ' +
        'FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid ' +
        "JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' " +
        'ORDER BY t.relname,c.conname',
    )
  ).rows;
  const indexes = (
    await client.query(
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' " +
        'ORDER BY tablename,indexname',
    )
  ).rows;
  const triggers = (
    await client.query(
      'SELECT event_object_table,trigger_name FROM information_schema.triggers ' +
        "WHERE trigger_schema='public' ORDER BY event_object_table,trigger_name",
    )
  ).rows;
  const functions = (
    await client.query(
      'SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args ' +
        'FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace ' +
        "WHERE n.nspname='public' ORDER BY p.proname",
    )
  ).rows;
  const lines = [
    '# Database data dictionary',
    '',
    'Generated from the migrated PostgreSQL catalog. These are the installed types and rules.',
    '',
  ];
  for (const table of [...new Set(columns.map((row) => row.table_name))]) {
    lines.push(
      '## ' + table,
      '',
      tablePurpose[table] ?? 'Project table.',
      '',
      '| Column | Type | Nullability | Default | Keys/rules | Description |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const column of columns.filter((row) => row.table_name === table)) {
      const rules = constraints
        .filter((row) => row.table_name === table && row.columns?.includes(column.column_name))
        .map((row) => ({ p: 'PK', f: 'FK', u: 'UNIQUE', c: 'CHECK' })[row.contype] ?? row.contype);
      const description =
        special[column.column_name] ??
        (column.column_name.endsWith('_id')
          ? 'Reference identifier for ' + column.column_name.slice(0, -3).replaceAll('_', ' ') + '.'
          : column.column_name.replaceAll('_', ' ') + ' value.');
      lines.push(
        '| ' +
          [
            column.column_name,
            column.data_type,
            column.required ? 'NOT NULL' : 'NULL',
            column.default_value,
            [...new Set(rules)].join(', ') || '—',
            description,
          ]
            .map(esc)
            .join(' | ') +
          ' |',
      );
    }
    lines.push('');
  }
  lines.push(
    '## Installed constraints',
    '',
    '| Table | Name | Actual definition |',
    '| --- | --- | --- |',
  );
  for (const row of constraints) {
    lines.push('| ' + [row.table_name, row.conname, row.definition].map(esc).join(' | ') + ' |');
  }
  lines.push(
    '',
    '## Installed indexes',
    '',
    '| Table | Name | Actual definition |',
    '| --- | --- | --- |',
  );
  for (const row of indexes) {
    lines.push('| ' + [row.tablename, row.indexname, row.indexdef].map(esc).join(' | ') + ' |');
  }
  lines.push(
    '',
    '## Views',
    '',
    '| View | Purpose and UI use |',
    '| --- | --- |',
    '| service_failure_summary | Incident, active, and critical counts by service; Dashboard. |',
    '| incident_resolution_stats | Average resolution interval by service and category; Dashboard. |',
    '',
    '## Triggers',
    '',
    '| Table | Trigger | Purpose |',
    '| --- | --- | --- |',
  );
  for (const row of triggers) {
    const purpose = row.trigger_name.includes('graph')
      ? 'Queue graph projection.'
      : row.trigger_name.includes('audit')
        ? 'Write audit event.'
        : row.trigger_name.includes('status')
          ? 'Validate status transition.'
          : row.trigger_name.includes('occurrence')
            ? 'Reject future occurrence.'
            : 'Maintain updated timestamp.';
    lines.push(
      '| ' + [row.event_object_table, row.trigger_name, purpose].map(esc).join(' | ') + ' |',
    );
  }
  lines.push('', '## Functions', '', '| Function | Purpose |', '| --- | --- |');
  for (const row of functions) {
    const purpose =
      row.proname === 'resolve_incident'
        ? 'Atomic resolution through PATCH incident API.'
        : row.proname === 'reopen_incident'
          ? 'Controlled reopen through POST reopen API.'
          : row.proname.includes('graph')
            ? 'Transactional outbox trigger.'
            : row.proname.includes('audit')
              ? 'Incident audit trigger.'
              : 'Database integrity trigger.';
    lines.push('| ' + esc(row.proname + '(' + row.args + ')') + ' | ' + purpose + ' |');
  }
  await writeFile('docs/DATA_DICTIONARY.md', lines.join('\n') + '\n');
  console.log(
    'Wrote docs/DATA_DICTIONARY.md: ' +
      columns.length +
      ' columns, ' +
      constraints.length +
      ' constraints, ' +
      indexes.length +
      ' indexes',
  );
} finally {
  await client.end();
}
