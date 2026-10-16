import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const marketplace = JSON.parse(read('.agents/plugins/marketplace.json'));

assert.equal(marketplace.name, 'my-codex-harness');
assert.deepEqual(marketplace.plugins.map(plugin => plugin.name), ['scope-focus']);
const [entry] = marketplace.plugins;
assert.equal(entry.source.source, 'local');
assert.equal(entry.source.path, './plugins/scope-focus');

const manifest = JSON.parse(read('plugins/scope-focus/.codex-plugin/plugin.json'));
assert.equal(manifest.name, 'scope-focus');
assert.match(manifest.version, /^0\.0\.0\+codex\.\d{14}$/);

const install = read('install-instructions/scope-focus.md');
const headings = ['## Состав', '## Требования', '## Первая установка', '## Проверка после установки', '## Обновление'];
let previous = -1;
for (const heading of headings) {
  const index = install.indexOf(heading);
  assert.ok(index > previous, heading);
  previous = index;
}

const agents = read('AGENTS.md');
assert.ok(agents.includes('node tests/run.mjs'));
assert.ok(agents.includes('WORKFLOW-MANIFEST.md'));
assert.ok(existsSync(path.join(root, 'WORKFLOW-MANIFEST.md')));

const prompt = read('new-model-instructions.md');
assert.ok(!prompt.includes('it is fine to explore other options to make the edit'), 'prompt: edits only through apply_patch');
assert.ok(!prompt.includes('when scripting is more efficient'), 'prompt: no scripted edits');
const design = read('SCOPE-FOCUS-DESIGN.md').replace(/\s+/g, ' ');
assert.ok(!design.includes('две проверки Spotty в Plan mode'), 'design: removed Plan mode Spotty checks');

console.log('PASS: repository plugin, install and policy consistency.');
