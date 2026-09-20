import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const marketplace = JSON.parse(read('.agents/plugins/marketplace.json'));
const pluginNames = ['scope-focus', 'lunatron', 'filesystem-search'];

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
    'model = "gpt-5.6-sol"', 'model_reasoning_effort = "low"', 'sandbox_mode = "read-only"',
  ],
  'plugins/lunatron/agents/lunatik.toml': [
    'model = "gpt-5.6-luna"', 'model_reasoning_effort = "max"',
  ],
  'plugins/lunatron/agents/luntik.toml': [
    'model = "gpt-5.6-luna"', 'model_reasoning_effort = "medium"',
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
assert.ok(!agents.includes('## Baseline'));
assert.ok(agents.includes('node tests/run.mjs'));
assert.ok(agents.includes('plugins/filesystem-search'));
assert.ok(agents.includes('install-instructions/filesystem-search.md'));
assert.ok(agents.includes('В автоматическом режиме Lunatron активируется у root только для `gpt-5.6-sol`'));
assert.ok(agents.includes('Точные корневые команды `ltn 1` и `ltn 0`'));

const lunatronHook = read('plugins/lunatron/hooks/lunatron.cjs');
assert.ok(lunatronHook.includes("new Set(['gpt-5.6-sol', 'gpt-6-astra'])"));
assert.ok(!lunatronHook.includes('gpt-5.5'));
assert.ok(lunatronHook.includes("new Set(['gpt-5.6-terra', ...SOL_MODELS])"));
assert.ok(!lunatronHook.includes('readReasoningEffort'));
const lunatronDesign = read('LUNATRON-REDESIGN.md');
assert.ok(lunatronDesign.includes('## 5. 2026-09-20: сужение model gate'));
assert.ok(lunatronDesign.includes('Это исторический контракт, заменённый решением от 2026-09-20 ниже.'));

const install = read('install-instructions/filesystem-search.md');
assert.equal((install.match(/BEGIN FILESYSTEM_SEARCH_GLOBAL_ROUTING/g) || []).length, 1);
assert.equal((install.match(/END FILESYSTEM_SEARCH_GLOBAL_ROUTING/g) || []).length, 1);
const pathConfig = install.indexOf('shell_environment_policy.set');
const freshTask = install.indexOf('После настройки environment открой новую Codex task');
const checks = install.indexOf('## Проверка после установки');
assert.ok(pathConfig >= 0 && freshTask > pathConfig && checks > freshTask);

console.log('PASS: repository plugin, profile, install, and policy consistency.');
