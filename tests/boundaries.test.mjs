import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = path.join(root, 'plugins', 'scope-focus');
const todoCli = path.join(P, 'tools', 'todo.cjs');
const readCli = path.join(P, 'tools', 'read.cjs');
const failures = [];
const dirs = [];

async function check(name, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(name);
    console.log(`FAIL: ${name}: ${e.message}`);
  }
}

const tmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf граница '));
  dirs.push(dir);
  return dir;
};
const runNode = (script, args, options = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', ...options });
const hookRun = (name, input, env) => runNode(path.join(P, 'hooks', name), [], { input, ...(env ? { env } : {}) });
const todoEnv = (home, sid) => ({ ...process.env, CODEX_HOME: home, CODEX_THREAD_ID: sid });
const todoArgv = (home, sid, ...ops) => runNode(todoCli, ops, { env: todoEnv(home, sid) });
const todoStdin = (home, sid, text) => runNode(todoCli, [], { env: todoEnv(home, sid), input: text });
const state = (home, sid) => JSON.parse(fs.readFileSync(path.join(home, 'scope-focus-todo', `todo-${sid}.json`), 'utf8'));
const taskCount = st => st.phases.reduce((n, phase) => n + phase.tasks.length, 0);
const initOne = 'init Проба: Один';
const initTwo = 'init Проба: Один | Два';

await check('communication: empty, invalid and SessionStart stdin', () => {
  for (const input of ['', 'not json', JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' })]) {
    const r = hookRun('communication.cjs', input);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('# Todo'), `${JSON.stringify(input)}: # Todo`);
    assert.ok(r.stdout.includes('Todo CLI: node "'), `${JSON.stringify(input)}: Todo CLI`);
    const head = r.stdout.trimStart();
    assert.ok(!head.startsWith('{') && !head.startsWith('['), `${JSON.stringify(input)}: JSON output`);
  }
});

await check('communication: SubagentStart payload', () => {
  const r = hookRun('communication.cjs', JSON.stringify({
    session_id: 's',
    turn_id: 't',
    transcript_path: null,
    cwd: '/tmp',
    hook_event_name: 'SubagentStart',
    model: 'gpt-6.1-sol',
    permission_mode: 'bypassPermissions',
    agent_id: 'a',
    agent_type: 'default',
  }), { ...process.env, CODEX_HOME: tmpDir() });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('# Codex tool mechanics'), '# Codex tool mechanics');
  assert.ok(r.stdout.includes('Reader CLI: node "'), 'Reader CLI: node "');
  assert.ok(!r.stdout.includes('Todo CLI:'), 'Todo CLI: must be absent');
  assert.ok(!r.stdout.includes('# Todo'), '# Todo must be absent');
});

await check('communication: compact and resume add the open todo snapshot', () => {
  const home = tmpDir();
  const sid = 'snap-1';
  const env = { ...process.env, CODEX_HOME: home };
  const todo = todoArgv(home, sid, initTwo);
  assert.equal(todo.status, 0, todo.stderr);
  const run = (source, session = sid) => hookRun('communication.cjs', JSON.stringify({ hook_event_name: 'SessionStart', source, session_id: session }), env);
  let r = run('compact');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('<todo>'), r.stdout);
  r = run('resume');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('<todo>'), r.stdout);
  r = run('startup');
  assert.ok(!r.stdout.includes('<todo>'), r.stdout);
  r = run('compact', 'snap-empty');
  assert.ok(!r.stdout.includes('<todo>'), r.stdout);
});

await check('hooks.json command from a plugin path with spaces and Cyrillic', () => {
  const copiedDir = path.join(tmpDir(), 'плагин с пробелом');
  fs.cpSync(P, copiedDir, { recursive: true });
  const hooks = JSON.parse(fs.readFileSync(path.join(P, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const r = spawnSync(hooks.SessionStart[0].hooks[0].command, {
    shell: true,
    env: { ...process.env, PLUGIN_ROOT: copiedDir },
    input: JSON.stringify({ hook_event_name: 'SessionStart' }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  // Node resolves required files through symlinks, so the printed path may use the real directory.
  const readers = [copiedDir, fs.realpathSync(copiedDir)].map(dir => path.join(dir, 'tools', 'read.cjs'));
  assert.ok(readers.some(reader => r.stdout.includes(reader)), path.join(copiedDir, 'tools', 'read.cjs'));
});

await check('todo hook: empty and invalid stdin are silent', () => {
  const home = tmpDir();
  for (const input of ['', 'x']) {
    const r = hookRun('todo.cjs', input, { ...process.env, CODEX_HOME: home });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  }
});

await check('todo hook: reminder, snapshot, subagent skip, Stop once', () => {
  const home = tmpDir();
  const sid = 'sess-1';
  const env = { ...process.env, CODEX_HOME: home };
  const prompt = extra => JSON.stringify({ session_id: sid, turn_id: 't', hook_event_name: 'UserPromptSubmit', prompt: 'p', ...extra });
  const stop = extra => JSON.stringify({ session_id: sid, turn_id: 't', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'x', ...extra });

  let r = hookRun('todo.cjs', prompt(), env);
  assert.ok(r.stdout.startsWith('<todo-reminder>'), r.stdout);

  r = todoArgv(home, sid, initTwo);
  assert.equal(r.status, 0, r.stderr);

  r = hookRun('todo.cjs', prompt(), env);
  assert.ok(r.stdout.startsWith('<todo>'), r.stdout);

  r = hookRun('todo.cjs', prompt({ agent_id: 'a', agent_type: 'x' }), env);
  assert.equal(r.stdout, '');

  r = hookRun('todo.cjs', stop(), env);
  const decision = JSON.parse(r.stdout);
  assert.equal(decision.decision, 'block');
  assert.ok(decision.reason.includes('1.1'), decision.reason);

  r = hookRun('todo.cjs', stop({ stop_hook_active: true }), env);
  assert.equal(r.stdout, '');

  r = todoArgv(home, sid, 'done 1.1', 'block 1.2: ждёт');
  assert.equal(r.status, 0, r.stderr);

  r = hookRun('todo.cjs', stop(), env);
  assert.equal(r.stdout, '');
});

await check('todo CLI: CODEX_HOME missing falls back to HOME/.codex', () => {
  const home = tmpDir();
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_THREAD_ID: 's2' };
  delete env.CODEX_HOME;
  const r = runNode(todoCli, [initOne], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(home, '.codex', 'scope-focus-todo', 'todo-s2.json')));
});

await check('todo CLI: CRLF ops on argv and stdin', () => {
  const home = tmpDir();
  const sid = 'crlf';
  let r = todoArgv(home, sid, 'init A: x\r\n');
  assert.equal(r.status, 0, r.stderr);
  r = todoStdin(home, sid, 'append: y\r\n');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(taskCount(state(home, sid)), 2);
});

await check('todo CLI: a failing op keeps earlier ops and prints the list', () => {
  const home = tmpDir();
  const sid = 'fail';
  let r = todoArgv(home, sid, initTwo);
  assert.equal(r.status, 0, r.stderr);
  r = todoArgv(home, sid, 'start 1.2', 'block 1.1');
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stdout.includes('Stopped at op 2'), r.stdout);
  assert.ok(r.stdout.includes('block has no reason'), r.stdout);
  assert.ok(r.stdout.includes('<todo>'), r.stdout);
  assert.equal(state(home, sid).phases[0].tasks[1].status, 'in_progress');
});

await check('todo CLI (BUG): parallel calls lose nothing', async () => {
  const home = tmpDir();
  const sid = 'par';
  const env = todoEnv(home, sid);
  const init = todoArgv(home, sid, 'init A: base');
  assert.equal(init.status, 0, init.stderr);
  const runChild = text => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [todoCli, text], { env });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stderr }));
  });
  for (let round = 1; round <= 3; round++) {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      runChild(`append: r${round}-${i + 1}`)));
    for (const result of results) {
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stderr, '');
    }
  }
  assert.equal(taskCount(state(home, sid)), 37);
  assert.deepEqual(fs.readdirSync(path.join(home, 'scope-focus-todo')), ['todo-par.json']);
});

await check('reader: CRLF lines', () => {
  const tmp = tmpDir();
  fs.writeFileSync(path.join(tmp, 'crlf.txt'), 'a\r\nb\r\n');
  const r = runNode(readCli, ['crlf.txt'], { cwd: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('=== crlf.txt (2 lines'), r.stdout);
  assert.ok(r.stdout.includes('\na\nb\n'), r.stdout);
  assert.ok(!r.stdout.includes('\r'), 'CR in output');
});

await check('reader: spaces and Cyrillic in --from', () => {
  const tmp = tmpDir();
  const dir = path.join(tmp, 'папка с пробелом');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x\n');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'y\n');
  let r = runNode(readCli, ['--budget', '1', 'папка с пробелом'], { cwd: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("next: --from 'папка с пробелом/b.txt'"), r.stdout);
  r = runNode(readCli, ['--budget', '1', '--from', 'папка с пробелом/b.txt', 'папка с пробелом'], { cwd: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('=== папка с пробелом/b.txt'), r.stdout);
});

await check('reader (BUG): explicitly named git-ignored paths', () => {
  const tmp = tmpDir();
  spawnSync('git', ['init', '-q'], { cwd: tmp });
  fs.writeFileSync(path.join(tmp, '.gitignore'), 'ignored.txt\nignored-dir/\n');
  fs.writeFileSync(path.join(tmp, 'ignored.txt'), 'i\n');
  fs.mkdirSync(path.join(tmp, 'ignored-dir'));
  fs.writeFileSync(path.join(tmp, 'ignored-dir', 'f.txt'), 'f\n');
  fs.writeFileSync(path.join(tmp, 'kept.txt'), 'k\n');
  let r = runNode(readCli, ['ignored.txt'], { cwd: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('=== ignored.txt'), r.stdout);
  r = runNode(readCli, ['ignored-dir'], { cwd: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('=== ignored-dir/f.txt'), r.stdout);
  r = runNode(readCli, ['.'], { cwd: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes('=== ignored.txt'), r.stdout);
  assert.ok(!r.stdout.includes('=== ignored-dir/f.txt'), r.stdout);
});

await check('reader: plain read stops at 1000 lines', () => {
  const tmp = tmpDir();
  fs.writeFileSync(path.join(tmp, 'long.txt'), `${Array.from({ length: 1500 }, (_, i) => `line ${i + 1}`).join('\n')}\n`);
  let r = runNode(readCli, ['long.txt'], { cwd: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('\nline 1000\n'), r.stdout);
  assert.ok(!r.stdout.includes('\nline 1001\n'), r.stdout);
  assert.ok(r.stdout.includes('[Use --lines 1001-1500 long.txt to continue.]'), r.stdout);
  r = runNode(readCli, ['--lines', '1001-1500', 'long.txt'], { cwd: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('\nline 1001\n') && r.stdout.includes('\nline 1500\n'), r.stdout);
});

await check('reader: content over 100000 characters is an error', () => {
  const tmp = tmpDir();
  fs.writeFileSync(path.join(tmp, 'wide.txt'), `${'x'.repeat(1900)}\n`.repeat(60));
  const r = runNode(readCli, ['wide.txt'], { cwd: tmp });
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stderr.includes('exceeds maximum allowed characters'), r.stderr);
});

for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });

if (failures.length === 0) console.log('PASS: boundaries.');
else process.exitCode = 1;
