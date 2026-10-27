import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const opening = 'developer_instructions = """\n';
const bodyOf = text => {
  const start = text.indexOf(opening);
  assert.ok(start >= 0, 'developer_instructions');
  return text.slice(start + opening.length, text.lastIndexOf('"""'));
};

const reviewers = [['spotty', 'gpt-6.1-terra', 'low'], ['bossy', 'gpt-6.1-terra', 'medium']];
const bodies = reviewers.map(([name, model, effort]) => {
  const text = read(`agents/${name}.toml`);
  for (const term of [
    `name = "${name}"`,
    `model = "${model}"`,
    `model_reasoning_effort = "${effort}"`,
    'sandbox_mode = "read-only"',
  ]) assert.ok(text.includes(term), `${name}: ${term}`);
  return bodyOf(text);
});
assert.equal(bodies[1], bodies[0], 'bossy developer_instructions');

for (const gone of ['smarty', 'code_writer', 'shell_runner', 'codebase_explorer', 'requirements-test-reviewer']) {
  assert.ok(!existsSync(path.join(root, 'agents', `${gone}.toml`)), `${gone} profile removed`);
}

for (const skill of ['todo', 'subagents', 'codex-tools', 'define-goal', 'blindreview', 'highreview']) {
  for (const file of ['SKILL.md', 'agents/openai.yaml']) {
    assert.ok(existsSync(path.join(root, 'skills', skill, file)), `${skill}/${file}`);
  }
  assert.ok(read(`skills/${skill}/agents/openai.yaml`).includes('allow_implicit_invocation: false'), `${skill}: implicit invocation off`);
}
for (const gone of ['approval', 'testreview', 'lightreview', 'gold-standard', 'clear-communication', 'main-workflow', 'light-review-cycle', 'blind-review-cycle', 'high-review-cycle']) {
  assert.ok(!existsSync(path.join(root, 'skills', gone)), `${gone} removed`);
}

const hooks = JSON.parse(read('hooks/hooks.json')).hooks;
assert.deepEqual(Object.keys(hooks), ['SessionStart', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit', 'Stop'], 'hook events');
assert.equal(hooks.SessionStart[0].hooks[0].additionalContextLimit, 65536, 'SessionStart');
assert.equal(hooks.SubagentStart[0].hooks[0].additionalContextLimit, 32768, 'SubagentStart');
assert.equal(Object.values(hooks).flatMap(groups => groups.flatMap(group => group.hooks)).length, 5, 'five hook definitions');
assert.ok(hooks.SubagentStop[0].hooks[0].command.includes("'subagents.cjs'"), 'SubagentStop record');

const runHook = eventName => {
  const result = spawnSync(process.execPath, [path.join(root, 'hooks', 'communication.cjs')], {
    input: JSON.stringify({ hook_event_name: eventName }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${eventName}: ${result.stderr}`);
  return result.stdout;
};

const session = runHook('SessionStart');
for (const term of ['# Codex tool mechanics', '# Todo', '# Subagents', 'Todo CLI:', 'Reader CLI:', 'Environment: paths: absolute like']) {
  assert.ok(session.includes(term), term);
}
for (const term of ['# Approval', '# Gold Standard', '# Main Workflow', '# Clear Communication']) assert.ok(!session.includes(term), `${term} must be absent`);
const subagent = runHook('SubagentStart');
for (const term of ['# Codex tool mechanics', 'Reader CLI:']) assert.ok(subagent.includes(term), term);
for (const term of ['# Todo', '# Subagents', 'Todo CLI:']) assert.ok(!subagent.includes(term), `${term} must be absent`);

console.log('PASS: Scope Focus profiles, skills and hook.');
