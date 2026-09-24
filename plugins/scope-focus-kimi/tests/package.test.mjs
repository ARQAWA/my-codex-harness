import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Structural tests for the scope-focus-kimi package.
// Run directly: node plugins/scope-focus-kimi/tests/package.test.mjs

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(path.join(root, rel), 'utf8');
const exists = rel => existsSync(path.join(root, rel));

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

check('manifest is valid JSON with required Kimi fields', () => {
  const manifest = JSON.parse(read('kimi.plugin.json'));
  assert.equal(manifest.name, 'scope-focus-kimi');
  assert.match(manifest.name, /^[a-z0-9][a-z0-9_-]{0,63}$/);
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.agents, './agents/');
  assert.equal(manifest.systemPromptPath, './SYSTEM.md');
  assert.equal(manifest.sessionStart.skill, 'scope-focus-bootstrap');
  assert.ok(Array.isArray(manifest.hooks) && manifest.hooks.length === 1);
  assert.equal(manifest.hooks[0].event, 'UserPromptSubmit');
});

check('manifest references resolve inside the package', () => {
  const manifest = JSON.parse(read('kimi.plugin.json'));
  const strip = p => p.replace(/^\.\//, '');
  assert.ok(exists(strip(manifest.skills)));
  assert.ok(exists(strip(manifest.agents)));
  assert.ok(exists(strip(manifest.systemPromptPath)));
  assert.ok(exists(path.join('skills', manifest.sessionStart.skill, 'SKILL.md')));
  assert.ok(exists(path.join('hooks', 'submit.cjs')));
  assert.ok(exists(path.join('hooks', 'submit.txt')));
});

check('system prompt fits the 32KB field limit', () => {
  const bytes = Buffer.byteLength(read('SYSTEM.md'), 'utf8');
  assert.ok(bytes <= 32 * 1024, `SYSTEM.md is ${bytes} bytes`);
});

check('every skill has name + description frontmatter', () => {
  const dirs = readdirSync(path.join(root, 'skills'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  assert.ok(dirs.length >= 7, `expected 7+ skills, found ${dirs.length}`);
  for (const dir of dirs) {
    const text = read(path.join('skills', dir, 'SKILL.md'));
    assert.match(text, /^---\nname: [a-z0-9-]+\ndescription: .+/m, dir);
  }
});

check('no Codex-only references remain', () => {
  const forbidden = ['process.env.PLUGIN_ROOT', 'PLUGIN_DATA', 'fork_context', 'fork_turns', '$blind-check-cycle', '$goal', 'openai.yaml', 'gpt-6-sol'];
  const files = ['SYSTEM.md', 'hooks/submit.cjs'];
  const walk = dir => readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  for (const file of [...files, ...walk('skills'), ...walk('agents'), ...walk('commands')]) {
    if (!file.endsWith('.md') && !file.endsWith('.cjs')) continue;
    const text = read(file);
    for (const token of forbidden) {
      assert.ok(!text.includes(token), `${file} contains ${token}`);
    }
  }
});

check('spotty agent is read-only markdown with verdict schema', () => {
  const text = read('agents/spotty.md');
  assert.match(text, /^---\nname: spotty\n/m);
  assert.ok(text.includes('CLEAN'));
  assert.ok(text.includes('FINDINGS:'));
  assert.ok(text.includes('REQUIRED OUTCOME'));
  assert.ok(text.includes('disallowedTools'));
});

check('submit hook accepts ContentPart[] and string prompts', () => {
  const run = input => execFileSync(process.execPath, [path.join(root, 'hooks', 'submit.cjs')], { input }).toString();
  const expected = read('hooks/submit.txt');
  assert.equal(run(JSON.stringify({ prompt: 'hello' })), expected);
  assert.equal(run(JSON.stringify({ prompt: [{ type: 'text', text: 'hi' }] })), expected);
});

check('submit hook fails cleanly on bad input', () => {
  try {
    execFileSync(process.execPath, [path.join(root, 'hooks', 'submit.cjs')], { input: '{}', stdio: ['pipe', 'pipe', 'pipe'] });
    assert.fail('expected non-zero exit');
  } catch (error) {
    assert.notEqual(error.status, 0);
  }
});

console.log(`\n${passed} checks passed.`);
