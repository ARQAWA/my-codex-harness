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
    'model = "gpt-6-sol"', 'model_reasoning_effort = "low"', 'sandbox_mode = "read-only"',
  ],
  'plugins/lunatron/agents/lunatik.toml': [
    'model = "gpt-6-luna"', 'model_reasoning_effort = "medium"',
  ],
  'plugins/lunatron/agents/luntik.toml': [
    'model = "gpt-6-luna"', 'model_reasoning_effort = "xhigh"',
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
assert.ok(agents.includes('Lunatron по умолчанию включён для корневой задачи независимо от модели;'));
assert.ok(agents.includes('Слитные `LNT1` и `LNT0` в любом регистре'));

const lunatronHook = read('plugins/lunatron/hooks/lunatron.cjs');
assert.ok(lunatronHook.includes("return { active: true, basis: 'default-on' }"));
assert.ok(lunatronHook.includes('Active mode requires delegation; do not ask for a separate request to use workers.'));
assert.ok(!lunatronHook.includes('gpt-5.5'));
assert.ok(!lunatronHook.includes('GUARDED_MODELS'));
assert.ok(!lunatronHook.includes('readReasoningEffort'));
const lunatronDesign = read('LUNATRON-DESIGN.md');
assert.ok(lunatronDesign.includes('## 5. 2026-09-20: сужение model gate'));
assert.ok(lunatronDesign.includes('Это исторический контракт, заменённый решением от 2026-09-20 ниже.'));

const install = read('install-instructions/filesystem-search.md');
assert.ok(install.includes('Этот блок больше\nне добавляется: его текст находится в `description` skill.'));
assert.ok(!agents.includes('<!-- BEGIN FILESYSTEM_SEARCH_GLOBAL_ROUTING -->'));
const fsSkill = read('plugins/filesystem-search/skills/filesystem-search/SKILL.md');
const description = fsSkill.match(/^description: \|-\n([\s\S]*?)\n---/m)?.[1].replace(/^  /gm, '').trimEnd();
assert.equal(description, `# Mandatory filesystem discovery routing

Before any command or tool call whose purpose is to discover files, symbols,
text, callers, dependencies, impact, or source context, load the
\`filesystem-search\` skill and follow its routing. This gate is mandatory and
comes before \`rg\`, \`grep\`, \`find\`, globs, AST scripts, or Codebase Memory CLI.
Read an already known exact path directly when discovery is not needed.`);
const pluginInstall = install.indexOf('codex plugin add');
const checks = install.indexOf('## Проверка после установки');
assert.ok(pluginInstall >= 0 && checks > pluginInstall);

const fsSearchDesign = read('FILESYSTEM-SEARCH-DESIGN.md');
assert.ok(fsSearchDesign.includes('root-дисциплина'));
assert.ok(fsSearchDesign.includes('2026-09-24'));

console.log('PASS: repository plugin, profile, install, and policy consistency.');
