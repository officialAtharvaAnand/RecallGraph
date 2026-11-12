import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const started = new Date().toISOString();
const result = spawnSync('npm', ['run', 'test:all'], {
  shell: process.platform === 'win32',
  encoding: 'utf8',
  env: process.env,
  cwd: process.cwd(),
  maxBuffer: 20 * 1024 * 1024,
});
const header = [
  'RecallGraph real test run',
  'Started: ' + started,
  'Node: ' + process.version,
  'Platform: ' + process.platform + ' ' + process.arch,
  'Database: isolated _test database created and dropped per integration suite',
  'Git metadata: not used',
  '',
].join('\n');
const output =
  header +
  (result.stdout ?? '') +
  (result.stderr ?? '') +
  '\nExit code: ' +
  String(result.status) +
  '\n';
mkdirSync('docs/test-results', { recursive: true });
writeFileSync('docs/test-results/latest.txt', output);
process.stdout.write(output);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
