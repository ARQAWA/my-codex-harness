import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const todoCli = path.join(root, 'plugins', 'scope-focus', 'tools', 'todo.cjs');
const todo = createRequire(import.meta.url)(todoCli);
const SID = 'todo-state-test';
const failures = [];

async function check(name, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(name);
    console.log(`FAIL: ${name}: ${e.message}`);
  }
}

// loadState reads CODEX_HOME at call time, so each check points the test process at its own home.
const freshHome = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-state-'));
  process.env.CODEX_HOME = dir;
  return dir;
};
const stateFile = (home) => path.join(home, 'scope-focus-todo', `todo-${SID}.json`);
const lockFile = (home) => `${stateFile(home)}.lock`;
const writeState = (home, text) => {
  fs.mkdirSync(path.join(home, 'scope-focus-todo'), { recursive: true });
  fs.writeFileSync(stateFile(home), text);
};
const runTodo = (home, text) => spawnSync(process.execPath, [todoCli, text], {
  encoding: 'utf8',
  env: { ...process.env, CODEX_HOME: home, CODEX_THREAD_ID: SID },
});
const saved = (home) => JSON.parse(fs.readFileSync(stateFile(home), 'utf8'));
const taskCount = (st) => st.phases.reduce((n, phase) => n + phase.tasks.length, 0);
const initOne = 'init Work: First';
const appendSecond = 'append: Second';

await check('missing state: loads as an empty list and init creates it', () => {
  const home = freshHome();
  const st = todo.loadState(SID);
  assert.deepEqual(st.phases, []);
  assert.equal(st.plans.size, 0);
  const r = runTodo(home, initOne);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(taskCount(saved(home)), 1);
});

await check('valid state: loads, and an append keeps the saved items and plan', () => {
  const home = freshHome();
  const planKey = 'Work\u0000First';
  const phases = [{ name: 'Work', tasks: [{ content: 'First', status: 'in_progress' }] }];
  writeState(home, JSON.stringify({ phases, plans: { [planKey]: { steps: ['a', 'b'], current: 1 } } }));
  const st = todo.loadState(SID);
  assert.deepEqual(st.phases, phases);
  assert.deepEqual(st.plans.get(planKey), { steps: ['a', 'b'], current: 1 });
  const r = runTodo(home, appendSecond);
  assert.equal(r.status, 0, r.stderr);
  const after = saved(home);
  assert.equal(taskCount(after), 2);
  assert.deepEqual(after.plans[planKey], { steps: ['a', 'b'], current: 1 });
});

await check('malformed JSON: loadState throws and the CLI leaves the file unchanged', () => {
  const home = freshHome();
  const text = '{"phases":[';
  writeState(home, text);
  assert.throws(() => todo.loadState(SID), /not valid JSON/);
  const r = runTodo(home, appendSecond);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON/);
  assert.equal(fs.readFileSync(stateFile(home), 'utf8'), text);
});

await check('unexpected shape: loadState throws and the CLI leaves the file unchanged', () => {
  const home = freshHome();
  const shapes = [
    { phases: 'none', plans: {} },
    { phases: [{ name: 'Work', tasks: [{ content: 'First', status: 'pending' }] }], plans: null },
    { phases: [{ name: 'Work', tasks: [{ content: 'First', status: 'pending' }] }], plans: { 'Work\u0000First': { steps: 'one', current: 1 } } },
  ];
  for (const shape of shapes) {
    const text = JSON.stringify(shape);
    writeState(home, text);
    assert.throws(() => todo.loadState(SID), /unexpected shape/, text);
    const r = runTodo(home, appendSecond);
    assert.equal(r.status, 1, text);
    assert.match(r.stderr, /unexpected shape/, text);
    assert.equal(fs.readFileSync(stateFile(home), 'utf8'), text, text);
  }
});

await check('state without plans: loads with no plans, and an append keeps the saved items', () => {
  const home = freshHome();
  const phases = [{ name: 'Work', tasks: [{ content: 'First', status: 'pending' }] }];
  writeState(home, JSON.stringify({ phases }));
  const st = todo.loadState(SID);
  assert.deepEqual(st.phases, phases);
  assert.equal(st.plans.size, 0);
  const r = runTodo(home, appendSecond);
  assert.equal(r.status, 0, r.stderr);
  const after = saved(home);
  assert.equal(taskCount(after), 2);
  assert.equal(after.phases[0].tasks[0].content, 'First');
});

await check('numeric-string current: a saved string loads as a number and a step saves a number', () => {
  const home = freshHome();
  const planKey = 'Work\u0000First';
  const phases = [{ name: 'Work', tasks: [{ content: 'First', status: 'in_progress' }] }];
  writeState(home, JSON.stringify({ phases, plans: { [planKey]: { steps: ['a', 'b', 'c'], current: '2' } } }));
  assert.deepEqual(todo.loadState(SID).plans.get(planKey), { steps: ['a', 'b', 'c'], current: 2 });
  const r = runTodo(home, 'step 1.1 3');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(saved(home).plans[planKey].current, 3);
});

await check('invalid current: the file is left alone', () => {
  const home = freshHome();
  const planKey = 'Work\u0000First';
  const phases = [{ name: 'Work', tasks: [{ content: 'First', status: 'in_progress' }] }];
  const bad = JSON.stringify({ phases, plans: { [planKey]: { steps: ['a', 'b', 'c'], current: 'two' } } });
  writeState(home, bad);
  assert.throws(() => todo.loadState(SID), /unexpected shape/);
  const r = runTodo(home, 'step 1.1 3');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unexpected shape/);
  assert.equal(fs.readFileSync(stateFile(home), 'utf8'), bad);
});

await check('unreadable state: loadState throws and the CLI leaves the directory unchanged', () => {
  const home = freshHome();
  fs.mkdirSync(stateFile(home), { recursive: true });
  assert.throws(() => todo.loadState(SID), /cannot be read/);
  const r = runTodo(home, appendSecond);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot be read/);
  assert.ok(fs.statSync(stateFile(home)).isDirectory());
});

await check('live owner: an old lock whose PID runs is not taken over', () => {
  const home = freshHome();
  fs.mkdirSync(path.join(home, 'scope-focus-todo'), { recursive: true });
  fs.writeFileSync(lockFile(home), String(process.pid));
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(lockFile(home), old, old);
  const r = runTodo(home, initOne);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /locked by another call/);
  assert.equal(fs.readFileSync(lockFile(home), 'utf8'), String(process.pid));
  assert.equal(fs.existsSync(stateFile(home)), false);
});

await check('dead owner: a lock whose PID no longer runs is reclaimed at once', () => {
  const home = freshHome();
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  fs.mkdirSync(path.join(home, 'scope-focus-todo'), { recursive: true });
  fs.writeFileSync(lockFile(home), String(dead));
  const r = runTodo(home, initOne);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(taskCount(saved(home)), 1);
  assert.equal(fs.existsSync(lockFile(home)), false);
});

const runArgs = (home, args) => spawnSync(process.execPath, [todoCli, ...args], {
  encoding: 'utf8',
  env: { ...process.env, CODEX_HOME: home, CODEX_THREAD_ID: SID },
});
const runStdin = (home, text) => spawnSync(process.execPath, [todoCli], {
  encoding: 'utf8',
  input: text,
  env: { ...process.env, CODEX_HOME: home, CODEX_THREAD_ID: SID },
});

await check('text ops via argv: init prints the list, done closes 1.1 and prints only 1.2', () => {
  const home = freshHome();
  let r = runArgs(home, ['init Фаза: a | b']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('<todo>'), r.stdout);
  r = runArgs(home, ['done']);
  assert.equal(r.status, 0, r.stderr);
  const st = saved(home);
  assert.equal(st.phases[0].tasks[0].status, 'completed');
  assert.equal(st.phases[0].tasks[1].status, 'in_progress');
  assert.equal(r.stdout, 'Done 1.1. Now: 1.2 "b", no plan.\n');
  r = runArgs(home, ['append: c']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('<todo>') && r.stdout.includes('1.3 ○ c'), r.stdout);
  r = runArgs(home, ['rm 1.3']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('<todo>') && !r.stdout.includes('1.3 ○ c'), r.stdout);
  r = runArgs(home, ['rm 1.2']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('<todo> 0 of 1 open'), r.stdout);
});

await check('text ops via argv: plan then step', () => {
  const home = freshHome();
  let r = runArgs(home, ['init Фаза: a | b']);
  assert.equal(r.status, 0, r.stderr);
  r = runArgs(home, ['plan: x | y']);
  assert.equal(r.status, 0, r.stderr);
  r = runArgs(home, ['step']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('Step 1.1: 2/2'), r.stdout);
  assert.equal(saved(home).plans['Фаза\u0000a'].current, 2);
});

await check('text ops via stdin lines', () => {
  const home = freshHome();
  const r = runStdin(home, 'init Ф: a | b\n\n  done  \n');
  assert.equal(r.status, 0, r.stderr);
  const st = saved(home);
  assert.equal(st.phases[0].tasks[0].status, 'completed');
  assert.equal(st.phases[0].tasks[1].status, 'in_progress');
});

await check('closed: lists the closed items', () => {
  const home = freshHome();
  assert.equal(runArgs(home, ['init Фаза: a | b']).status, 0);
  assert.equal(runArgs(home, ['done']).status, 0);
  const r = runArgs(home, ['closed']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('1.1 ✓ a'), r.stdout);
});

await check('JSON ops fail and leave the saved list unchanged', () => {
  const home = freshHome();
  assert.equal(runTodo(home, initOne).status, 0);
  const before = fs.readFileSync(stateFile(home), 'utf8');
  const r = runTodo(home, '{"ops":[{"op":"done","item":"1.1"}]}');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('unknown op'), r.stdout);
  assert.equal(fs.readFileSync(stateFile(home), 'utf8'), before);
});

if (failures.length === 0) console.log('PASS: todo state.');
else process.exitCode = 1;
