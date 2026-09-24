import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'skills', 'filesystem-search', 'scripts', 'tgrep-search.cjs');
const skill = readFileSync(path.join(root, 'skills', 'filesystem-search', 'SKILL.md'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
const temp = mkdtempSync(path.join(os.tmpdir(), 'filesystem-search-test-'));
const run = (args, cwd = temp) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd });

try {
  const missingDelimiter = run([temp, 'needle', '.']);
  assert.equal(missingDelimiter.status, 2);
  assert.match(missingDelimiter.stderr, /mandatory -- delimiter is missing/);

  const invalidRoot = run([path.join(temp, 'missing'), '--', 'needle', '.']);
  assert.equal(invalidRoot.status, 2);
  assert.match(invalidRoot.stderr, /root/i);

  const invalidScope = run([temp, '--', 'needle', 'missing']);
  assert.equal(invalidScope.status, 2);
  assert.match(invalidScope.stderr, /scope/i);

  assert.equal(run([temp, '--files', '-e', 'needle', '--', '.']).status, 2);
  const ownedIndex = run([temp, '--index-path', 'elsewhere', '--', 'needle', '.']);
  assert.equal(ownedIndex.status, 2);
  assert.match(ownedIndex.stderr, /index/i);

  const homeRoot = run([os.homedir(), '--', 'needle', '.'], os.homedir());
  assert.equal(homeRoot.status, 2);
  assert.match(homeRoot.stderr, /project root/i);

  const subdir = path.join(temp, 'sub');
  mkdirSync(subdir);
  const subdirRoot = run([temp, '--', 'needle', '.'], subdir);
  assert.equal(subdirRoot.status, 2);
  assert.match(subdirRoot.stderr, /project root/i);

  assert.ok(existsSync(path.join(root, 'hooks', 'hooks.json')));
  JSON.parse(readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));

  assert.equal(manifest.name, 'filesystem-search');
  assert.match(manifest.version, /^0\.0\.0\+codex\.\d{14}$/);
  for (const term of [
    'Load this skill before discovery',
    'Known exact path: read it directly',
    'Use only the installed `codebase-memory-mcp cli`',
  ]) assert.ok(skill.includes(term), term);
  assert.match(readFileSync(script, 'utf8'), /TGREP_BACKEND_UNAVAILABLE/);

  console.log('PASS: Filesystem Search CLI grammar and packaged routing contract.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
