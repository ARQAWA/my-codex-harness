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
assert.ok(!agents.includes('## Baseline'));
assert.ok(agents.includes('node tests/run.mjs'));
assert.ok(agents.includes('plugins/filesystem-search'));
assert.ok(agents.includes('install-instructions/filesystem-search.md'));
assert.ok(agents.includes('Lunatron по умолчанию включён для корневой задачи независимо от модели;'));
assert.ok(agents.includes('Слитные `LNT1` и `LNT0` в любом регистре'));

const lunatronHook = read('plugins/lunatron/hooks/lunatron.cjs');
assert.ok(lunatronHook.includes("return { active: true, basis: 'default-on' }"));
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

const fsManifest = JSON.parse(read('plugins/filesystem-search/.codex-plugin/plugin.json'));
const fsEntry = marketplace.plugins.find(plugin => plugin.name === 'filesystem-search');
assert.equal(fsEntry.source.source, 'local');
assert.equal(fsEntry.source.path, './plugins/filesystem-search');
assert.equal(marketplace.name, 'my-codex-harness');
assert.equal(fsManifest.author.name, 'A. Chukavin');
assert.equal(fsManifest.skills, './skills/');
assert.equal(fsManifest.interface.displayName, 'Filesystem Search');
assert.deepEqual(fsManifest.interface.capabilities, ['Filesystem discovery', 'Code structure search']);
assert.match(fsManifest.description, /tgrep.*macOS\/Linux.*rg.*Windows/s);
assert.match(fsManifest.interface.longDescription, /macOS\/Linux.*tgrep.*Windows.*rg -n.*rg --files.*Codebase Memory.*ast-grep/s);

const fsInstallMac = read('install-instructions/filesystem-search.md');
const pluginInstall = fsInstallMac.indexOf('codex plugin add');
const checks = fsInstallMac.indexOf('## Проверка после установки');
assert.ok(pluginInstall >= 0 && checks > pluginInstall);
assert.ok(fsInstallMac.includes('на macOS и Linux'));
assert.ok(fsInstallMac.includes('tgrep'));

const fsInstallWindows = read('install-instructions/filesystem-search-windows.md');
const windowsHeadings = ['## Состав', '## Требования', '## Первая установка', '## Проверка после установки', '## Обновление'];
let previousWindowsHeading = -1;
for (const heading of windowsHeadings) {
  const index = fsInstallWindows.indexOf(heading);
  assert.ok(index > previousWindowsHeading, `filesystem-search-windows: ${heading}`);
  previousWindowsHeading = index;
}
const windowsComponent = fsInstallWindows.match(/## Состав\n([\s\S]*?)\n## Требования/)?.[1];
assert.ok(windowsComponent);
assert.ok(!windowsComponent.includes('tgrep'));
for (const term of [
  'rg -n', 'rg --files', 'codebase-memory-mcp --version',
  'config set auto_index true', 'config get auto_index',
  'codebase-memory-mcp --',
  'git+https://github.com/ast-grep/ast-grep-mcp@149e20d47bb7125fb0c1451feea2f48a98742034',
  '--with ast-grep-cli', 'mcp_optional_startup_grace_ms = 0',
  'startup_timeout_sec = 30', 'UV_OFFLINE=1', 'hooks/list', 'config/batchWrite',
  'FILESYSTEM_SEARCH_GLOBAL_ROUTING', 'connection closed: initialize response',
  '7,561 с', 'CBM 0.11.0', '6,892 с', 'ast-grep-cli` 0.45.3', 'не удаляй'
]) assert.ok(fsInstallWindows.includes(term), `Windows install: ${term}`);
assert.ok(fsInstallWindows.includes('VS Code'));
assert.ok(fsInstallWindows.includes('одну новую задачу Codex'));
assert.ok(fsInstallWindows.includes('SessionStart'));
assert.ok(fsInstallWindows.includes('SubagentStart'));
assert.ok(!fsInstallWindows.includes('C:\\Users\\'));

const fsSkill = read('plugins/filesystem-search/skills/filesystem-search/SKILL.md');
const description = fsSkill.match(/^description: \|-\n([\s\S]*?)\n---/m)?.[1].replace(/^  /gm, '').trimEnd();
assert.ok(description);
assert.match(description, /macOS(?:\/| and )Linux/);
assert.match(description, /Windows/);
for (const term of ['tgrep', 'rg -n', 'rg --files', 'Codebase Memory', 'ast-grep']) {
  assert.ok(description.includes(term), `skill description: ${term}`);
  assert.ok(fsSkill.includes(term), `skill body: ${term}`);
}
for (const term of ['search_graph', 'trace_path', 'find_code', 'index_repository', 'persistence: false', 'auto_index = true']) {
  assert.ok(fsSkill.includes(term), `skill body: ${term}`);
}

const fsHook = read('plugins/filesystem-search/hooks/search-context.cjs');
assert.ok(fsHook.includes("process.platform === 'win32'"));
assert.ok(fsHook.includes("process.stdout.write(lines.join('\\n'))"));
const windowsHook = fsHook.match(/\? \[([\s\S]*?)\]\s*:\s*\[/)?.[1];
const unixHook = fsHook.match(/:\s*\[([\s\S]*?)\];/)?.[1];
assert.ok(windowsHook && unixHook);
for (const term of ['rg -n', 'rg --files', 'Codebase Memory', 'search_graph', 'trace_path', 'ast-grep', 'persistence: false']) {
  assert.ok(windowsHook.includes(term), `Windows hook: ${term}`);
}
assert.ok(!windowsHook.includes('tgrep'));
assert.ok(unixHook.includes('tgrep'));
assert.ok(unixHook.includes('Codebase Memory'));
assert.ok(unixHook.includes('ast-grep'));
assert.ok(!fsHook.includes('child_process'));

const fsHooks = JSON.parse(read('plugins/filesystem-search/hooks/hooks.json')).hooks;
assert.deepEqual(Object.keys(fsHooks), ['SessionStart', 'SubagentStart']);
assert.equal(fsHooks.SessionStart[0].matcher, '^(startup|resume|clear|compact)$');
for (const event of ['SessionStart', 'SubagentStart']) {
  const commandHook = fsHooks[event][0].hooks[0];
  assert.equal(commandHook.type, 'command');
  assert.equal(commandHook.timeout, 7);
  assert.ok(commandHook.command.includes('process.env.PLUGIN_ROOT'));
  assert.ok(commandHook.command.includes('search-context.cjs'));
  assert.ok(commandHook.command.includes("'hooks'"));
}

const installEntrypoint = read('INSTALL_FOR_AGENTS.md');
assert.ok(installEntrypoint.includes('filesystem-search.md'));
assert.ok(installEntrypoint.includes('filesystem-search-windows.md'));
assert.match(installEntrypoint, /macOS\/Linux:[\s\S]*native Windows 11:/);
assert.ok(!agents.includes('<!-- BEGIN FILESYSTEM_SEARCH_GLOBAL_ROUTING -->'));
assert.ok(!agents.includes('<!-- END FILESYSTEM_SEARCH_GLOBAL_ROUTING -->'));

const skillTextRoute = fsSkill.match(/2\. \*\*Text and filenames:\*\*([\s\S]*?)\n3\./)?.[1];
assert.ok(skillTextRoute);
const macTextRoute = skillTextRoute.match(/macOS\/Linux:([\s\S]*?)\n\s+- Windows:/)?.[1];
const windowsTextRoute = skillTextRoute.match(/Windows:([\s\S]*)/)?.[1];
assert.ok(macTextRoute?.includes('tgrep'));
assert.ok(windowsTextRoute?.includes('rg -n') && windowsTextRoute.includes('rg --files'));
assert.ok(!windowsTextRoute.includes('tgrep'));
assert.ok(fsSkill.includes('search_graph'));
assert.ok(fsSkill.includes('trace_path'));
assert.ok(fsSkill.includes('find_code'));
assert.ok(fsInstallWindows.includes('codex plugin add'));
assert.ok(fsInstallWindows.includes('index_repository'));
assert.ok(fsInstallWindows.includes('persistence: false'));

const fsSearchDesign = read('FILESYSTEM-SEARCH-DESIGN.md');
for (const term of ['macOS/Linux', 'Windows', 'tgrep', 'rg -n', 'rg --files', 'CBM MCP', 'граф', 'ast-grep', 'auto_index = true', 'stdout']) {
  assert.ok(fsSearchDesign.includes(term), `filesystem-search design: ${term}`);
}
assert.ok(fsSearchDesign.includes('Исторический контракт'));
const designCurrent = fsSearchDesign.match(/## Текущий контракт: отдельные маршруты по ОС([\s\S]*?)\n### Решение о платформенном разделении/)?.[1];
const designWindowsRoute = designCurrent?.match(/На native Windows 11([\s\S]*?)\n\nНа Windows/)?.[1];
assert.ok(designWindowsRoute?.includes('rg -n'));
assert.ok(designWindowsRoute.includes('rg --files'));
assert.match(designWindowsRoute, /она не устанавливает и не\s+использует `tgrep`/);

console.log('PASS: repository plugin, profile, install, and policy consistency.');
