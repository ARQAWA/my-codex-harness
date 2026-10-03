import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = process.argv.slice(2);
if (!names.length || new Set(names).size !== names.length) {
  throw new Error('Укажи изменённые плагины один раз: node tools/update-plugin-cachebuster.mjs <plugin> [...]');
}
const marketplace = JSON.parse(readFileSync(path.join(root, '.agents/plugins/marketplace.json'), 'utf8'));
const version = `0.0.0+codex.${new Date().toISOString().slice(0, 19).replace(/[-T:]/g, '')}`;
const updates = names.map(name => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`Некорректное имя: ${name}`);
  const entry = marketplace.plugins.find(plugin => plugin.name === name);
  if (entry?.source?.source !== 'local' || entry.source.path !== `./plugins/${name}`) {
    throw new Error(`Marketplace должен указывать на ./plugins/${name}`);
  }
  const file = path.join(root, 'plugins', name, '.codex-plugin/plugin.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (manifest.name !== name || !/^0\.0\.0\+codex\.\d{14}$/.test(manifest.version)) {
    throw new Error(`Некорректный manifest: ${name}`);
  }
  if (version <= manifest.version) throw new Error(`UTC-версия должна быть новее ${manifest.version}`);
  const previous = manifest.version;
  const cursorFile = path.join(root, 'plugins', name, '.cursor-plugin/plugin.json');
  const cursorManifest = existsSync(cursorFile) ? JSON.parse(readFileSync(cursorFile, 'utf8')) : null;
  if (cursorManifest && (cursorManifest.name !== name || cursorManifest.version !== previous)) {
    throw new Error(`Cursor manifest должен иметь те же имя и текущую версию: ${name}`);
  }
  manifest.version = version;
  if (cursorManifest) cursorManifest.version = version;
  return { file, manifest, cursorFile, cursorManifest, name, previous };
});
for (const { file, manifest, cursorFile, cursorManifest, name, previous } of updates) {
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (cursorManifest) writeFileSync(cursorFile, `${JSON.stringify(cursorManifest, null, 2)}\n`, 'utf8');
  console.log(`${name}: ${previous} -> ${version}`);
}
