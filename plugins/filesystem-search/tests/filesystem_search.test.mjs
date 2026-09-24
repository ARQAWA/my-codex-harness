import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = path.join(root, 'skills', 'filesystem-search', 'scripts');
const tgrepScript = path.join(scripts, 'tgrep-search.cjs');
const astGrepScript = path.join(scripts, 'ast-grep-search.cjs');
const cbmIndexScript = path.join(scripts, 'cbm-index.cjs');
const cbmSearchScript = path.join(scripts, 'cbm-search.cjs');
const guard = path.join(root, 'hooks', 'fssearch-guard.cjs');
const skill = readFileSync(path.join(root, 'skills', 'filesystem-search', 'SKILL.md'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
const temp = mkdtempSync(path.join(os.tmpdir(), 'filesystem-search-test-'));
const run = (script, args, cwd = temp) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd, env: { ...process.env, FSSEARCH_SESSION_ROOT: cwd } });
const runHook = command => spawnSync(
  process.execPath,
  ['-e', `require(${JSON.stringify(guard)}).preToolUse()`],
  { encoding: 'utf8', input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: temp, tool_input: { command } }) },
);
const denied = command => runHook(command).stdout.includes('"permissionDecision":"deny"');

try {
  const missingDelimiter = run(tgrepScript, [temp, 'needle', '.']);
  assert.equal(missingDelimiter.status, 2);
  assert.match(missingDelimiter.stderr, /mandatory -- delimiter is missing/);

  const invalidRoot = run(tgrepScript, [path.join(temp, 'missing'), '--', 'needle', '.']);
  assert.equal(invalidRoot.status, 2);
  assert.match(invalidRoot.stderr, /root/i);

  const invalidScope = run(tgrepScript, [temp, '--', 'needle', 'missing']);
  assert.equal(invalidScope.status, 2);
  assert.match(invalidScope.stderr, /scope/i);

  assert.equal(run(tgrepScript, [temp, '--files', '-e', 'needle', '--', '.']).status, 2);
  const ownedIndex = run(tgrepScript, [temp, '--index-path', 'elsewhere', '--', 'needle', '.']);
  assert.equal(ownedIndex.status, 2);
  assert.match(ownedIndex.stderr, /index/i);

  const subdir = path.join(temp, 'sub');
  mkdirSync(subdir);

  for (const [script, args] of [
    [tgrepScript, ['--', 'needle', '.']],
    [astGrepScript, ['--pattern', 'needle()', '--lang', 'python', '--', '.']],
    [cbmIndexScript, []],
    [cbmSearchScript, ['search_graph']],
  ]) {
    const homeRoot = run(script, [os.homedir(), ...args], os.homedir());
    assert.equal(homeRoot.status, 2, `${script} home root`);
    assert.match(homeRoot.stderr, /project root/i);
    const subdirRoot = run(script, [temp, ...args], subdir);
    assert.equal(subdirRoot.status, 2, `${script} subdir root`);
    assert.match(subdirRoot.stderr, /project root/i);
  }

  const astNoPattern = run(astGrepScript, [temp, '--lang', 'python', '--', '.']);
  assert.equal(astNoPattern.status, 2);
  assert.match(astNoPattern.stderr, /--pattern is required/);
  const astRewrite = run(astGrepScript, [temp, '--pattern', 'a()', '--lang', 'python', '--rewrite', 'b()', '--', '.']);
  assert.equal(astRewrite.status, 2);
  assert.match(astRewrite.stderr, /unsupported or invalid option/);
  const astAbsScope = run(astGrepScript, [temp, '--pattern', 'a()', '--lang', 'python', '--', '/tmp']);
  assert.equal(astAbsScope.status, 2);
  assert.match(astAbsScope.stderr, /invalid scope/);
  const astEscapeScope = run(astGrepScript, [temp, '--pattern', 'a()', '--lang', 'python', '--', '..']);
  assert.equal(astEscapeScope.status, 2);
  assert.match(astEscapeScope.stderr, /invalid scope/);
  const astMissingScope = run(astGrepScript, [temp, '--pattern', 'a()', '--lang', 'python', '--', 'missing']);
  assert.equal(astMissingScope.status, 2);
  assert.match(astMissingScope.stderr, /scope does not exist/);

  const cbmExtraArg = run(cbmIndexScript, [temp, '--mode', 'fast']);
  assert.equal(cbmExtraArg.status, 2);
  assert.match(cbmExtraArg.stderr, /no extra arguments/);
  for (const args of [
    ['delete_project'], ['index_repository'], ['search_graph', '--project', 'other'],
    ['search_graph', '--project=other'], ['search_graph', '{"project":"other"}'],
    ['search_graph', '--args-file', 'args.json'],
  ]) assert.equal(run(cbmSearchScript, [temp, ...args]).status, 2);
  const noContext = spawnSync(process.execPath, [cbmIndexScript, temp], {
    encoding: 'utf8', cwd: temp, env: { ...process.env, FSSEARCH_SESSION_ROOT: '' },
  });
  assert.equal(noContext.status, 2);
  assert.match(noContext.stderr, /FSSEARCH_SESSION_ROOT/);
  assert.equal(run(tgrepScript, [temp, '--follow', '--', 'x', '.']).status, 2);
  assert.equal(run(tgrepScript, [temp, '--', 'x', 'sub/../sub']).status, 2);

  for (const command of [
    'tgrep serve /x',
    'cd /x && tgrep index',
    'cd /x &&tgrep serve',
    'codebase-memory-mcp cli index_repository --repo-path /x',
    'codebase-memory-mcp cli search_graph --query index_repository --project p',
    'tgrep needle .',
    'codebase-memory-mcp cli --json index_repository --repo-path .',
    'codebase-memory-mcp allow-root --approve-sensitive /x',
    'codebase-memory-mcp install',
    'codebase-memory-mcp',
    'ast-grep --pattern a() --lang python .',
    'ast-grep --pattern a() --lang python src/ --json',
    'sg --pattern a() --lang python .',
    `cd sub && node ${JSON.stringify(cbmIndexScript)} ${JSON.stringify(temp)}`,
    `node ${JSON.stringify(cbmIndexScript)} "$PWD"`,
    `FSSEARCH_SESSION_ROOT=/other node ${JSON.stringify(cbmIndexScript)} /other`,
    `env node ${JSON.stringify(cbmIndexScript)} /other`,
    'env tgrep needle .',
  ]) assert.ok(denied(command), `hook must deny: ${command}`);
  for (const command of [
    `node ${JSON.stringify(tgrepScript)} ${JSON.stringify(temp)} -- serve .`,
    `node ${JSON.stringify(astGrepScript)} ${JSON.stringify(temp)} --pattern 'a()' --lang python -- src`,
    `node ${JSON.stringify(cbmIndexScript)} ${JSON.stringify(temp)}`,
    `node ${JSON.stringify(cbmSearchScript)} ${JSON.stringify(temp)} search_graph --name-pattern 'leaf'`,
    'codebase-memory-mcp cli list_projects --detail identity --format json',
    'codebase-memory-mcp config list',
    'codebase-memory-mcp --help',
    'ast-grep --version',
    'ast-grep --help',
    'rg foo',
    "echo 'tgrep serve /x'",
  ]) assert.ok(!denied(command), `hook must allow: ${command}`);

  const rewritten = JSON.parse(runHook(`node ${JSON.stringify(tgrepScript)} ${JSON.stringify(temp)}`).stdout).hookSpecificOutput.updatedInput.command;
  assert.ok(rewritten.includes(`FSSEARCH_SESSION_ROOT='${realpathSync(temp)}'`));
  const shifted = spawnSync('bash', ['-c', rewritten], { encoding: 'utf8', cwd: subdir });
  assert.equal(shifted.status, 2);
  assert.match(shifted.stderr, /mandatory -- delimiter/); // Root accepted despite changed shell cwd.

  assert.ok(existsSync(path.join(root, 'hooks', 'hooks.json')));
  const hooks = JSON.parse(readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  assert.equal(hooks.hooks.PreToolUse[0].matcher, '^(shell|Bash)$');

  assert.equal(manifest.name, 'filesystem-search');
  assert.match(manifest.version, /^0\.0\.0\+codex\.\d{14}$/);
  for (const term of [
    'Load this skill before discovery',
    'Known exact path: read it directly',
    'Use only the installed `codebase-memory-mcp cli`',
  ]) assert.ok(skill.includes(term), term);
  assert.match(readFileSync(tgrepScript, 'utf8'), /TGREP_BACKEND_UNAVAILABLE/);

  console.log('PASS: Filesystem Search CLI grammar and packaged routing contract.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
