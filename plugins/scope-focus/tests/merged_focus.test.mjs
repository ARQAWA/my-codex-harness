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

const reviewers = [['spotty', 'low'], ['smarty', 'medium'], ['bossy', 'high']];
const bodies = reviewers.map(([name, effort]) => {
  const text = read(`agents/${name}.toml`);
  for (const term of [
    `name = "${name}"`,
    'model = "gpt-6.1-sol"',
    `model_reasoning_effort = "${effort}"`,
    'sandbox_mode = "read-only"',
  ]) assert.ok(text.includes(term), `${name}: ${term}`);
  return bodyOf(text);
});
assert.equal(bodies[1], bodies[0], 'smarty developer_instructions');
assert.equal(bodies[2], bodies[0], 'bossy developer_instructions');

for (const name of ['code_writer', 'shell_runner']) {
  const text = read(`agents/${name}.toml`);
  for (const term of [`name = "${name}"`, 'model = "gpt-6-luna"', 'model_reasoning_effort = "max"']) {
    assert.ok(text.includes(term), `${name}: ${term}`);
  }
}

for (const skill of ['main-workflow', 'subagents', 'subagent-brief', 'define-goal']) {
  for (const file of ['SKILL.md', 'agents/openai.yaml']) {
    assert.ok(existsSync(path.join(root, 'skills', skill, file)), `${skill}/${file}`);
  }
}

const hooks = JSON.parse(read('hooks/hooks.json')).hooks;
assert.equal(hooks.SessionStart[0].hooks[0].additionalContextLimit, 65536, 'SessionStart');
assert.equal(hooks.SubagentStart[0].hooks[0].additionalContextLimit, 32768, 'SubagentStart');

const runHook = eventName => {
  const result = spawnSync(process.execPath, [path.join(root, 'hooks', 'communication.cjs')], {
    input: JSON.stringify({ hook_event_name: eventName }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${eventName}: ${result.stderr}`);
  return result.stdout;
};

const session = runHook('SessionStart');
for (const term of ['# Gold Standard', '# Main Workflow', '# Subagents', '# Clear Communication']) {
  assert.ok(session.includes(term), term);
}
const subagent = runHook('SubagentStart');
for (const term of ['# Codex tool mechanics', 'Reader CLI:']) assert.ok(subagent.includes(term), term);
assert.ok(!subagent.includes('# Main Workflow'));
assert.ok(!subagent.includes('# Gold Standard'));

console.log('PASS: Scope Focus profiles, skills and hook.');
