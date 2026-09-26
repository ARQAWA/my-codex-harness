import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const spotty = readFileSync(path.join(root, 'agents', 'spotty.toml'), 'utf8');
for (const term of [
  'name = "spotty"',
  'model = "gpt-6-sol"',
  'model_reasoning_effort = "low"',
  'sandbox_mode = "read-only"',
  'review_stage',
  '`pre-action`',
  '`pre-completion`',
  'substantial',
  'stage',
]) assert.ok(spotty.includes(term), term);
assert.ok(!spotty.includes('properliler'));

for (const skill of ['high-review-cycle', 'double-light-review-cycle']) {
  const text = readFileSync(path.join(root, 'skills', skill, 'SKILL.md'), 'utf8');
  assert.ok(text.includes('frozen object'), skill);
  assert.ok(text.includes('pre-action'), skill);
}
const blindCheck = readFileSync(path.join(root, 'skills', 'high-review-cycle', 'SKILL.md'), 'utf8');
assert.ok(blindCheck.includes('agent_type=smarty'));
assert.ok(blindCheck.includes('the selected cycle reaches its required clean-pass count'));
assert.ok(blindCheck.includes('no new invocation is required after\na repair'));
for (const file of ['SKILL.md', 'agents/openai.yaml', 'LICENSE.txt']) {
  assert.ok(existsSync(path.join(root, 'skills', 'goal', file)), file);
}

const notebook = readFileSync(path.join(root, 'skills', 'task-notebook', 'SKILL.md'), 'utf8');
for (const term of [
  'Use only when the user selects Task Notebook',
  "path.join(os.tmpdir(), 'scope-focus', 'task-notebook'",
  "Buffer.from(session_id, 'utf8').toString('hex'), 'plan.md')",
  '`working`',
  '`waiting`',
  '`blocked`',
  '`complete`',
  '`cancelled`',
  'Create only `plan.md` initially',
]) assert.ok(notebook.includes(term), term);
assert.ok(!existsSync(path.join(root, 'skills', 'goal-memory')));

const cleanup = readFileSync(path.join(root, 'skills', 'cleanup-task', 'SKILL.md'), 'utf8');
for (const term of ['explicitly invoked', 'Task Notebook', '`rm -f`', '`--force`']) {
  assert.ok(cleanup.includes(term), term);
}

console.log('PASS: Scope Focus review, Goal, Task Notebook, and cleanup contracts.');
