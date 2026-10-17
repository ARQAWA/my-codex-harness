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
const decisionShim = path.join(root, 'tests', 'fixtures', 'stub-decisions-shim.cjs');
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
const todoArgv = (home, sid, text) => runNode(todoCli, [text], { env: todoEnv(home, sid) });
const todoStdin = (home, sid, text) => runNode(todoCli, [], { env: todoEnv(home, sid), input: text });
const state = (home, sid) => JSON.parse(fs.readFileSync(path.join(home, 'scope-focus-todo', `todo-${sid}.json`), 'utf8'));
const taskCount = st => st.phases.reduce((n, phase) => n + phase.tasks.length, 0);
const initOne = '{"ops":[{"op":"init","list":[{"phase":"Проба","items":["Один"]}]}]}';
const initTwo = '{"ops":[{"op":"init","list":[{"phase":"Проба","items":["Один","Два"]}]}]}';

await check('communication: empty, invalid and SessionStart stdin', () => {
  for (const input of ['', 'not json', JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' })]) {
    const r = hookRun('communication.cjs', input);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('# Gold Standard'), `${JSON.stringify(input)}: # Gold Standard`);
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
    model: 'gpt-6-luna',
    permission_mode: 'bypassPermissions',
    agent_id: 'a',
    agent_type: 'shell_runner',
  }));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('# Codex tool mechanics'), '# Codex tool mechanics');
  assert.ok(r.stdout.includes('Reader CLI: node "'), 'Reader CLI: node "');
  assert.ok(!r.stdout.includes('Todo CLI:'), 'Todo CLI: must be absent');
  assert.ok(!r.stdout.includes('# Gold Standard'), '# Gold Standard must be absent');
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
  const env = { ...process.env, CODEX_HOME: home, NODE_OPTIONS: `--require ${decisionShim}` };
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

  r = todoArgv(home, sid, '[{"op":"done","item":"1.1"},{"op":"block","item":"1.2","reason":"ждёт"}]');
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

await check('todo CLI: CRLF JSON on argv and stdin', () => {
  const home = tmpDir();
  const sid = 'crlf';
  let r = todoArgv(home, sid, '{"ops":[\r\n{"op":"init","list":[{"phase":"A","items":["x"]}]}\r\n]}');
  assert.equal(r.status, 0, r.stderr);
  r = todoStdin(home, sid, '{"ops":[\r\n{"op":"append","items":["y"]}\r\n]}');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(taskCount(state(home, sid)), 2);
});

await check('todo CLI (BUG): numeric item number', () => {
  const home = tmpDir();
  const sid = 'num';
  let r = todoArgv(home, sid, initTwo);
  assert.equal(r.status, 0, r.stderr);
  const before = state(home, sid).phases[0].tasks[0].status;
  r = todoArgv(home, sid, '{"ops":[{"op":"done","item":1.1}]}');
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('Stopped at op 1'), r.stdout);
  assert.ok(r.stdout.includes('item must be a string'), r.stdout);
  assert.ok(!r.stderr.includes('TypeError'), r.stderr);
  const after = state(home, sid).phases[0].tasks[0].status;
  assert.equal(after, before);
  assert.notEqual(after, 'completed');
});

await check('todo CLI (BUG): wrong field type keeps earlier ops', () => {
  const home = tmpDir();
  const sid = 'type';
  let r = todoArgv(home, sid, initTwo);
  assert.equal(r.status, 0, r.stderr);
  r = todoArgv(home, sid, '{"ops":[{"op":"start","item":"1.2"},{"op":"block","item":"1.1","reason":5}]}');
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stdout.includes('Stopped at op 2'), r.stdout);
  assert.ok(r.stdout.includes('reason must be a string'), r.stdout);
  assert.ok(!r.stderr.includes('TypeError'), r.stderr);
  assert.equal(state(home, sid).phases[0].tasks[1].status, 'in_progress');
});

await check('todo CLI (BUG): plan steps that are not a list', () => {
  const home = tmpDir();
  const sid = 'plan';
  let r = todoArgv(home, sid, initOne);
  assert.equal(r.status, 0, r.stderr);
  r = todoArgv(home, sid, '{"ops":[{"op":"plan","steps":"abc"}]}');
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('Stopped at op 1'), r.stdout);
  assert.ok(r.stdout.includes('steps must be a list of strings'), r.stdout);
  assert.ok(!r.stderr.includes('TypeError'), r.stderr);
  r = todoArgv(home, sid, '{"ops":[{"op":"plan","steps":["a",2]}]}');
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('Stopped at op 1'), r.stdout);
  r = todoArgv(home, sid, '{"ops":[{"op":"plan","steps":["a","b"]}]}');
  assert.equal(r.status, 0, r.stderr);
});

await check('todo CLI (BUG): parallel calls lose nothing', async () => {
  const home = tmpDir();
  const sid = 'par';
  const env = todoEnv(home, sid);
  const init = todoArgv(home, sid, '{"ops":[{"op":"init","list":[{"phase":"A","items":["base"]}]}]}');
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
      runChild(JSON.stringify({ ops: [{ op: 'append', items: [`r${round}-${i + 1}`] }] }))));
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

for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });

if (failures.length === 0) console.log('PASS: boundaries.');
else process.exitCode = 1;
