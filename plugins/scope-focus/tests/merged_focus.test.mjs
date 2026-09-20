import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hooks = JSON.parse(readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8')).hooks;
const run = path.join(root, 'hooks', 'run.cjs');
const temp = mkdtempSync(path.join(os.tmpdir(), 'scope-focus-test-'));
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));

function invoke(fn, value) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(run)}).${fn}()`], {
    input: value === undefined ? '' : JSON.stringify(value),
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp },
  });
}

assert.deepEqual(Object.keys(hooks).sort(), ['SessionStart', 'UserPromptSubmit']);
assert.equal(hooks.SessionStart.length, 2);
assert.equal(hooks.SessionStart[0].matcher, '^(startup|resume|clear|compact)$');
assert.match(JSON.stringify(hooks.SessionStart), /sessionStart/);
assert.match(JSON.stringify(hooks.SessionStart), /solReminders/);
assert.equal(hooks.UserPromptSubmit[0].additionalContextLimit, 2500);
assert.ok(!JSON.stringify(hooks).includes('Stop'));
assert.ok(!JSON.stringify(hooks).includes('Subagent'));

const sessionResult = invoke('sessionStart', {
  hook_event_name: 'SessionStart',
  session_id: 'scope-test',
});
assert.equal(sessionResult.status, 0, sessionResult.stderr);
const session = JSON.parse(sessionResult.stdout).hookSpecificOutput;
assert.equal(session.hookEventName, 'SessionStart');
for (const term of [
  'SCOPE FOCUS CONTRACT',
  'Exact outcome lock',
  'First-sufficient execution ladder',
  'Default exclusions',
  'Final answer gate',
  'scope-focus/task-notebook',
]) assert.ok(session.additionalContext.includes(term), term);
assert.ok(!session.additionalContext.includes('every 6 actions'));

const reminderResult = invoke('solReminders', {
  hook_event_name: 'SessionStart',
  model: 'gpt-5.6-sol',
});
assert.equal(reminderResult.status, 0, reminderResult.stderr);
const reminder = JSON.parse(reminderResult.stdout).hookSpecificOutput;
assert.equal(reminder.hookEventName, 'SessionStart');
for (const term of ['every 6 actions', 'every 66 actions', 'notifications.txt', 'absolute.txt']) {
  assert.ok(reminder.additionalContext.includes(term), term);
}
for (const input of [
  { hook_event_name: 'SessionStart', model: 'gpt-5.6-terra' },
  { hook_event_name: 'UserPromptSubmit', model: 'gpt-5.6-sol' },
]) {
  const result = invoke('solReminders', input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
}

const submitResult = invoke('userPromptSubmit', { prompt: 'ordinary request' });
assert.equal(submitResult.status, 0, submitResult.stderr);
const submit = JSON.parse(submitResult.stdout).hookSpecificOutput;
assert.equal(submit.hookEventName, 'UserPromptSubmit');
for (const term of [
  'exact outcome',
  'mandatory procedure',
  'first sufficient',
  'smallest local patch',
  'mandatory evidence',
  'Stop immediately',
]) assert.ok(submit.additionalContext.includes(term), term);
const invalidSubmit = invoke('userPromptSubmit', {});
assert.equal(invalidSubmit.status, 1);
assert.match(invalidSubmit.stderr, /UserPromptSubmit unavailable/);

const spotty = readFileSync(path.join(root, 'agents', 'spotty.toml'), 'utf8');
for (const term of [
  'name = "spotty"',
  'model = "gpt-5.6-sol"',
  'model_reasoning_effort = "low"',
  'sandbox_mode = "read-only"',
  'review_stage',
  '`pre-action`',
  '`pre-completion`',
  'substantial',
  'stage',
]) assert.ok(spotty.includes(term), term);
assert.ok(!spotty.includes('properliler'));

for (const skill of ['blind-check-cycle', 'blind-double-check-cycle']) {
  const text = readFileSync(path.join(root, 'skills', skill, 'SKILL.md'), 'utf8');
  assert.ok(text.includes('frozen object'), skill);
  assert.ok(text.includes('pre-action'), skill);
}
const blindCheck = readFileSync(path.join(root, 'skills', 'blind-check-cycle', 'SKILL.md'), 'utf8');
assert.ok(blindCheck.includes('agent_type=spotty'));
assert.ok(blindCheck.includes('Repeat autonomously until one pass'));
assert.ok(blindCheck.includes('no new invocation is required after a repair'));
for (const file of ['SKILL.md', 'agents/openai.yaml', 'LICENSE.txt']) {
  assert.ok(existsSync(path.join(root, 'skills', 'goal', file)), file);
}

const notebook = readFileSync(path.join(root, 'skills', 'task-notebook', 'SKILL.md'), 'utf8');
for (const term of [
  'Use only when the user selects Task Notebook',
  'scope-focus/task-notebook/<session-key>/plan.md',
  '`working`',
  '`waiting`',
  '`blocked`',
  '`complete`',
  '`cancelled`',
  'Create only `plan.md` initially',
]) assert.ok(notebook.includes(term), term);
assert.ok(!existsSync(path.join(root, 'skills', 'goal-memory')));

const cleanup = readFileSync(path.join(root, 'skills', 'task-cleanup', 'SKILL.md'), 'utf8');
for (const term of ['explicitly invoked', 'Task Notebook', '`rm -f`', '`--force`']) {
  assert.ok(cleanup.includes(term), term);
}

console.log('PASS: Scope Focus current hook, review, Goal, and Task Notebook contracts.');
