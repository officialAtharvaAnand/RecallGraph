import { spawnSync } from 'node:child_process';

for (const suite of ['unit', 'sql', 'api', 'graph']) {
  console.log('\n=== test:' + suite + ' ===');
  const result = spawnSync('npm', ['run', 'test:' + suite], {
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
