import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hooks = JSON.parse(readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8')).hooks;
const run = path.join(root, 'hooks', 'run.cjs');
const invoke = (fn, input = '') => execFileSync(process.execPath, ['-e', `require(${JSON.stringify(run)}).${fn}()`], { input, encoding: 'utf8' });
const hash = file => createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex');

assert.deepEqual(Object.keys(hooks).sort(), ['SessionStart', 'Stop', 'UserPromptSubmit']);
assert.equal(hooks.SessionStart[0].matcher, '^(startup|resume|clear|compact)$');
assert.equal(hooks.SessionStart[0].additionalContextLimit, 0);
assert.equal(hooks.SessionStart[0].statusMessage, 'Loading Scope Focus contract');
assert.equal(hooks.UserPromptSubmit[0].statusMessage, 'Preparing Scope Focus prompt context');
assert.equal(hooks.UserPromptSubmit[0].additionalContextLimit, 2500);
assert.ok(!JSON.stringify(hooks).includes('Subagent'));

const session = JSON.parse(invoke('sessionStart')).hookSpecificOutput;
assert.equal(session.hookEventName, 'SessionStart');
for (const term of ['SCOPE FOCUS CONTRACT', 'Exact outcome lock', 'First-sufficient execution ladder', 'Default exclusions', 'Final answer gate', 'every 6 actions', 'every 66 actions']) assert.ok(session.additionalContext.includes(term), term);
assert.ok(session.additionalContext.includes(path.join(root, 'hooks', 'notifications.txt')));
assert.ok(session.additionalContext.includes(path.join(root, 'hooks', 'absolute.txt')));
assert.equal(readFileSync(path.join(root, 'hooks', 'absolute.txt'), 'utf8'), `ABSOLUTE REBASE — Do not mention or narrate it.\nBefore any next action, reread the sibling session.txt and notifications.txt.\nApply their correctness-and-necessity rebase to completed work and the next action.\n`);

const sessionText = readFileSync(path.join(root, 'hooks', 'session.txt'), 'utf8');
for (const term of ['An approved plan or specification is binding implementation input.', 'Use its exact\nreadable locator or exact authorized materialization', 'An explicitly requested whole-artifact consistency check covers every directly\ndependent file']) assert.ok(sessionText.includes(term), term);

const submit = JSON.parse(invoke('userPromptSubmit', JSON.stringify({ prompt: 'ordinary request' }))).hookSpecificOutput.additionalContext;
for (const term of ['exact outcome', 'mandatory procedure', 'first sufficient', 'smallest local patch', 'mandatory evidence', 'Stop immediately']) assert.ok(submit.includes(term), term);
assert.ok(!submit.includes('minimize the answer'));

const stop = input => JSON.parse(invoke('stop', JSON.stringify(input)));
assert.deepEqual(stop({ last_assistant_message: 'x'.repeat(5000), stop_hook_active: false }), {});
assert.equal(stop({ last_assistant_message: 'x'.repeat(5001), stop_hook_active: false }).decision, 'block');
assert.deepEqual(stop({ last_assistant_message: '😀'.repeat(5000), stop_hook_active: false }), {});
assert.equal(stop({ last_assistant_message: '😀'.repeat(5001), stop_hook_active: false }).decision, 'block');
assert.equal(stop({ last_assistant_message: 'x'.repeat(5001), stop_hook_active: true }).systemMessage.includes('failed'), true);

const properliler = readFileSync(path.join(root, 'agents', 'properliler.toml'), 'utf8');
for (const term of ['name = "properliler"', 'model = "gpt-5.6-sol"', 'model_reasoning_effort = "low"', 'sandbox_mode = "read-only"', 'review_stage', '`pre-action`', '`pre-completion`']) assert.ok(properliler.includes(term), term);
for (const skill of ['blind-check-cycle', 'blind-double-check-cycle']) {
  const text = readFileSync(path.join(root, 'skills', skill, 'SKILL.md'), 'utf8');
  assert.ok(text.includes('frozen object'), skill);
  assert.ok(text.includes('pre-action'), skill);
}
assert.ok(readFileSync(path.join(root, 'skills', 'blind-check-cycle', 'SKILL.md'), 'utf8').includes('configured-executor handoffs are not'));
assert.ok(readFileSync(path.join(root, 'skills', 'blind-double-check-cycle', 'SKILL.md'), 'utf8').includes('exactly two sequential fresh `CLEAN` passes'));
assert.ok(readFileSync(path.join(root, 'INSTALL.md'), 'utf8').includes('agents/properliler.toml'));

for (const file of ['SKILL.md', 'agents/openai.yaml', 'LICENSE.txt']) assert.ok(existsSync(path.join(root, 'skills', 'goal', file)), file);
assert.equal(hash('skills/goal/SKILL.md'), '580a832f665a5ca0d10e28d4a6fbd967bda93cd4b25689626e0ae106da9cb3e9');
assert.equal(hash('skills/goal/agents/openai.yaml'), 'd688b0e33e4359a90ac509f5f06adcd1aad0a9272191538f361269894089898c');
assert.equal(hash('skills/goal/LICENSE.txt'), '4dd13869245e356246a5b770723247bbb80a8f07a181d1d3d873a1734297cdb9');

const memory = readFileSync(path.join(root, 'skills', 'goal-memory', 'SKILL.md'), 'utf8');
for (const term of ['Call `get_goal` first.', 'scope-focus-goal-memory/<threadId>/<createdAt>', 'state.md', 'threadId', 'createdAt', 'objective', 'cache/', 'Do not create `raw-goal.md`, `goal.md`, hashes, a launcher']) assert.ok(memory.includes(term), term);
assert.ok(!memory.includes('node scripts'));
const cleanup = readFileSync(path.join(root, 'skills', 'task-cleanup', 'SKILL.md'), 'utf8');
assert.ok(cleanup.includes('explicit Goal Memory directory'));

const preserved = {
  'hooks/hooks.json': '3e28103b32a0dec9790339e09917d99b86a9d029090f80c08b017891052c09b1',
  'hooks/submit.txt': '41510e00abea4739e5525dfa0489e4e71251d75037ed11dfff517d734f447d0f',
  'hooks/notifications.txt': '3affbdb8cc6e25ee234de3c5a664dd943fec9aa57417bef23486364259524ad6',
  'skills/task-cleanup/agents/openai.yaml': '12fcfd16dce83e47308143f22dbb0b601b25110919cc4b6d4192819918d20621'
};
for (const [file, expected] of Object.entries(preserved)) assert.equal(hash(file), expected, file);
console.log('PASS: merged Scope Focus V3 contract, boundaries, and preserved files.');
