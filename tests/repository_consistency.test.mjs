import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const marketplace = JSON.parse(read('.agents/plugins/marketplace.json'));
const pluginNames = ['scope-focus', 'lunatron'];

for (const name of pluginNames) {
  const manifest = JSON.parse(read(`plugins/${name}/.codex-plugin/plugin.json`));
  const entry = marketplace.plugins.find(plugin => plugin.name === name);
  assert.ok(entry, `marketplace entry: ${name}`);
  assert.equal(manifest.name, name);
  assert.equal(entry.source.source, 'local');
  assert.equal(entry.source.path, `./plugins/${name}`);
  assert.match(manifest.version, /^0\.0\.0\+codex\.\d{14}$/);
}

const profiles = {
  'plugins/scope-focus/agents/spotty.toml': [
    'name = "spotty"',
    'model = "gpt-6.1-sol"', 'model_reasoning_effort = "low"', 'sandbox_mode = "read-only"',
  ],
  'plugins/lunatron/agents/lunatik.toml': [
    'model = "gpt-6-luna"', 'model_reasoning_effort = "medium"',
  ],
  'plugins/lunatron/agents/luntik.toml': [
    'model = "gpt-6-luna"', 'model_reasoning_effort = "medium"',
  ],
};
for (const [file, terms] of Object.entries(profiles)) {
  const text = read(file);
  for (const term of terms) assert.ok(text.includes(term), `${file}: ${term}`);
}

const headings = ['## Состав', '## Требования', '## Первая установка', '## Проверка после установки', '## Обновление'];
for (const name of pluginNames) {
  const text = read(`install-instructions/${name}.md`);
  let previous = -1;
  for (const heading of headings) {
    const index = text.indexOf(heading);
    assert.ok(index > previous, `${name}: ${heading}`);
    previous = index;
  }
}

const agents = read('AGENTS.md');
const installEntrypoint = read('INSTALL_FOR_AGENTS.md');
assert.ok(!agents.includes('## Baseline'));
assert.ok(agents.includes('node tests/run.mjs'));
assert.ok(agents.includes('Lunatron по умолчанию выключен для корневой задачи независимо от модели;'));
assert.ok(agents.includes('Слитные `LNT1` и `LNT0` в любом регистре'));

const lunatronHook = read('plugins/lunatron/hooks/lunatron.cjs');
assert.ok(lunatronHook.includes("return { active: false, basis: 'default-off' }"));
assert.ok(lunatronHook.includes('Read the bundled lunatron-delegation skill first.'));
assert.ok(lunatronHook.includes('only when that skill authorizes delegation'));
const delegationSkill = read('plugins/lunatron/skills/lunatron-delegation/SKILL.md');
assert.match(delegationSkill, /delegate work\s+blocks according to the active Lunatron hook contract/);
assert.ok(delegationSkill.includes('This instruction applies only to an active root task.'));
assert.ok(!lunatronHook.includes('gpt-5.5'));
assert.ok(!lunatronHook.includes('GUARDED_MODELS'));
assert.ok(!lunatronHook.includes('readReasoningEffort'));
const lunatronDesign = read('LUNATRON-DESIGN.md');
assert.ok(lunatronDesign.includes('## 5. 2026-09-20: сужение model gate'));
assert.ok(lunatronDesign.includes('Это исторический контракт, заменённый решением от 2026-09-20 ниже.'));

assert.equal(marketplace.name, 'my-codex-harness');

console.log('PASS: repository plugin, profile, install, and policy consistency.');
