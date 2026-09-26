import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suites = [
  'plugins/scope-focus/tests/merged_focus.test.mjs',
  'plugins/lunatron/tests/lunatron.test.mjs',
  'tests/repository_consistency.test.mjs',
];
let failed = false;

for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(root, suite)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`FAIL: ${suite} (exit ${result.status ?? 'signal'})\n`);
  }
}

if (failed) process.exitCode = 1;
else console.log('PASS: all repository suites.');
