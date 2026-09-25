// Explicit native acceptance; not part of the dependency-free repository suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/filesystem-search/scripts');
const { request, locations, watcherExecutable } = require(path.join(scripts, 'cbm-runtime.cjs'));
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fssearch-acceptance-')));
const root = path.join(temp, 'repo');
const plain = path.join(temp, 'plain');
const home = path.join(temp, 'codex');
for (const dir of [root, plain, home]) fs.mkdirSync(dir);
process.env.CODEX_HOME = home;
process.env.FSSEARCH_SESSION_ROOT = root;
const watcherPath = watcherExecutable();
const target = process.platform === 'darwin' ? 'aarch64-apple-darwin'
  : process.platform === 'linux' ? 'x86_64-unknown-linux-musl'
    : 'x86_64-pc-windows-gnu';
const watcherSource = path.join(path.dirname(path.dirname(path.dirname(scripts))), 'bin', target,
  `cbm-watcher${process.platform === 'win32' ? '.exe' : ''}`);
fs.mkdirSync(path.dirname(watcherPath), { recursive: true });
fs.copyFileSync(watcherSource, watcherPath);
if (process.platform !== 'win32') fs.chmodSync(watcherPath, 0o755);
const projects = new Set();
const daemons = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (exe, args, cwd = root, env = {}) => new Promise(resolve => execFile(exe, args,
  { cwd, env: { ...process.env, ...env }, timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
  (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })));
const wrapper = (name, args, r = root, cwd = r) => run(process.execPath,
  [path.join(scripts, name + '.cjs'), r, ...args], cwd, { FSSEARCH_SESSION_ROOT: r });
const ok = result => { assert.equal(result.code, 0, result.stderr); return result; };
async function stop(pid) {
  try { process.kill(pid, 'SIGTERM'); } catch (e) { if (e.code === 'ESRCH') return; throw e; }
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') return; throw e; }
    await sleep(100);
  }
  throw new Error(`created daemon ${pid} did not stop`);
}
async function until(fn, message) {
  const deadline = Date.now() + 45000;
  do { if (await fn()) return; await sleep(1000); } while (Date.now() < deadline);
  throw new Error(message);
}
async function remember(r) {
  const state = await request(r, 'ready');
  assert.equal(state.code, 0, state.stderr);
  projects.add(state.project); daemons.add(state.pid);
  return state;
}
const graph = (name, r = root) => wrapper('cbm-search', ['search_graph', '--name-pattern', name, '--format', 'json'], r);
const source = name => `def ${name}():\n    return "FSSEARCH_TEXT"\n\ndef caller():\n    return ${name}()\n`;
try {
  ok(await run('git', ['init', '-q']));
  ok(await run('git', ['config', 'user.email', 'fixture@example.invalid']));
  ok(await run('git', ['config', 'user.name', 'Fixture']));
  fs.writeFileSync(path.join(root, 'probe.py'), source('leaf'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'generated/\n');
  fs.writeFileSync(path.join(root, '.cbmignore'), 'cbm-native-ignored/\n');
  fs.mkdirSync(path.join(root, 'generated'));
  fs.mkdirSync(path.join(root, 'cbm-native-ignored'));
  fs.writeFileSync(path.join(root, 'cbm-native-ignored', 'ignored.py'), 'def cbm_native_ignored_marker(): return "CBM_NATIVE_IGNORED"\n');
  fs.writeFileSync(path.join(root, 'generated', 'ignored.py'), 'def cbm_ignored_marker(): return "IGNORED_NEEDLE"\n');
  fs.writeFileSync(path.join(root, 'generated', 'large-sentinel.txt'), 'IGNORED_BULK_SENTINEL\n'.repeat(32768));
  fs.writeFileSync(path.join(root, '.git', 'ignored-git-sentinel.py'), 'def cbm_git_internal_marker(): return "GIT_INTERNAL_SENTINEL"\n');
  fs.writeFileSync(path.join(root, '.hidden.py'), 'HIDDEN_NEEDLE\n');
  ok(await run('git', ['add', 'probe.py', '.gitignore']));
  ok(await run('git', ['commit', '-qm', 'fixture']));
  const base = ok(await run('git', ['rev-parse', 'HEAD'])).stdout.trim();

  const cold = await Promise.all([0, 1].map(async () => {
    const result = await request(root, 'query', 'search_graph', ['--name-pattern', 'leaf', '--format', 'json']);
    if (result.project) projects.add(result.project);
    if (result.pid) daemons.add(result.pid);
    return result;
  }));
  for (const result of cold) assert.match(ok(result).stdout, /leaf/);
  const cbm = await remember(root);
  assert.equal((await remember(root)).pid, cbm.pid);
  const socketPath = locations(root).socket;
  const ipcStarted = Date.now();
  const fragmented = await new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let text = '';
    client.setEncoding('utf8');
    client.once('error', reject);
    client.on('data', chunk => { text += chunk; });
    client.on('end', () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } });
    const request = JSON.stringify({ root: fs.realpathSync(root), op: 'query', tool: 'search_graph',
      args: ['--name-pattern', 'leaf', '--format', 'json'] }) + '\n';
    client.once('connect', () => {
      client.write(request.slice(0, Math.floor(request.length / 2)));
      setTimeout(() => client.write(request.slice(Math.floor(request.length / 2))), 100);
    });
  });
  assert.equal(fragmented.code, 0, fragmented.stderr);
  assert.equal(fragmented.pid, cbm.pid);
  assert.match(fragmented.stdout, /leaf/);
  assert.ok(Date.now() - ipcStarted >= 50, 'IPC response must remain open during a delayed query');
  const relation = ok(await wrapper('cbm-search', ['query_graph', '--query', 'MATCH (a)-[:CALLS]->(b) RETURN a.name, b.name', '--format', 'json']));
  assert.match(relation.stdout, /caller/); assert.match(relation.stdout, /leaf/);
  const ignoredGraph = ok(await graph('cbm_ignored_marker'));
  assert.doesNotMatch(ignoredGraph.stdout, /cbm_ignored_marker|IGNORED_NEEDLE|IGNORED_BULK_SENTINEL|GIT_INTERNAL_SENTINEL/);
  const gitGraph = ok(await graph('cbm_git_internal_marker'));
  assert.doesNotMatch(gitGraph.stdout, /cbm_git_internal_marker|GIT_INTERNAL_SENTINEL/);
  const nativeIgnoredGraph = ok(await graph('cbm_native_ignored_marker'));
  assert.doesNotMatch(nativeIgnoredGraph.stdout, /cbm_native_ignored_marker|CBM_NATIVE_IGNORED/);
  console.log('PASS: CBM cold/concurrent/warm queries and graph relationship.');

  const nestedRoot = path.join(root, 'nested-project'); fs.mkdirSync(nestedRoot);
  fs.writeFileSync(path.join(nestedRoot, 'nested.py'), 'def nested_old_marker(): return "value"\n');
  const nestedInitial = ok(await request(nestedRoot, 'query', 'search_graph', ['--name-pattern', 'nested_old_marker', '--format', 'json']));
  projects.add(nestedInitial.project); daemons.add(nestedInitial.pid);
  assert.match(nestedInitial.stdout, /nested_old_marker/);
  fs.writeFileSync(path.join(nestedRoot, 'nested.py'), 'def nested_new_marker(): return "value"\n');
  await until(async () => /nested_new_marker/.test(ok(await wrapper('cbm-search', ['search_graph', '--name-pattern', 'nested_new_marker', '--format', 'json'], nestedRoot, nestedRoot)).stdout), 'CBM did not reindex a changed file under a nested project root');
  console.log('PASS: CBM change detection for a project nested inside a Git repository.');

  const indexed = await Promise.all([
    wrapper('tgrep-search', ['--stats', '--', 'IGNORED_NEEDLE|IGNORED_BULK_SENTINEL|GIT_INTERNAL_SENTINEL', '.']),
    wrapper('tgrep-search', ['--hidden', '--stats', '--', 'IGNORED_NEEDLE|GIT_INTERNAL_SENTINEL', '.']),
    wrapper('tgrep-search', ['--hidden', '-g', '*.py', '--stats', '--', 'HIDDEN_NEEDLE', '.']),
  ]);
  for (const result of indexed) assert.match(result.stdout + result.stderr, /via server/);
  assert.equal(indexed[0].code, 1, indexed[0].stdout + indexed[0].stderr);
  assert.equal(indexed[1].code, 1, indexed[1].stdout + indexed[1].stderr);
  assert.doesNotMatch(indexed[1].stdout, /IGNORED_NEEDLE|GIT_INTERNAL_SENTINEL/);
  assert.equal(indexed[2].code, 0, indexed[2].stderr);
  const listing = ok(await wrapper('tgrep-search', ['--files', '-g', '*.py', '--stats', '--', '.']));
  assert.match(listing.stdout + listing.stderr, /via server/);
  assert.doesNotMatch(listing.stdout, /generated\/ignored\.py|large-sentinel|ignored-git-sentinel|\.git\//);
  assert.match(listing.stdout, /probe\.py/);
  assert.doesNotMatch(listing.stdout, /\.hidden\.py/);
  assert.equal((await wrapper('tgrep-search', ['--', 'NO_SUCH_NEEDLE_731', '.'])).code, 1);
  assert.equal((await wrapper('tgrep-search', ['--', '(', '.'])).code, 2);
  console.log('PASS: tgrep cold/concurrent, gitignore exclusion, hidden/glob, empty/error distinction.');

  fs.writeFileSync(path.join(root, 'probe.py'), source('changed_leaf'));
  await until(async () => /changed_leaf/.test(ok(await graph('changed_leaf')).stdout), 'CBM edit was not indexed');
  await until(async () => (await wrapper('tgrep-search', ['--', 'changed_leaf', '.'])).code === 0, 'tgrep edit was not indexed');
  fs.renameSync(path.join(root, 'probe.py'), path.join(root, 'renamed.py'));
  await until(async () => /renamed/.test(ok(await graph('changed_leaf')).stdout), 'CBM rename was not indexed');
  fs.unlinkSync(path.join(root, 'renamed.py'));
  await until(async () => !/changed_leaf/.test(ok(await graph('changed_leaf')).stdout), 'CBM delete was not indexed');
  ok(await run('git', ['checkout', base, '--', 'probe.py']));
  await until(async () => /leaf/.test(ok(await graph('^leaf$')).stdout), 'CBM checkout was not indexed');
  console.log('PASS: CBM/tgrep edit; CBM rename/delete/checkout.');

  await stop(cbm.pid); daemons.delete(cbm.pid);
  fs.writeFileSync(path.join(root, 'probe.py'), source('offline_leaf'));
  ok(await graph('leaf'));
  const restarted = await remember(root);
  assert.notEqual(restarted.pid, cbm.pid);
  await until(async () => /offline_leaf/.test(ok(await graph('offline_leaf')).stdout), 'CBM restart missed offline edits');

  fs.writeFileSync(path.join(plain, 'plain.py'), source('plain_leaf'));
  fs.writeFileSync(path.join(plain, '.gitignore'), 'plain-gitignored/\n');
  fs.writeFileSync(path.join(plain, '.cbmignore'), 'plain-cbmignored/\n');
  fs.writeFileSync(path.join(plain, '.ignore'), 'plain-nativeignored/\n');
  for (const dir of ['plain-gitignored', 'plain-cbmignored', 'plain-nativeignored']) {
    fs.mkdirSync(path.join(plain, dir));
    const marker = `plain_${dir.replaceAll('-', '_')}_marker`;
    fs.writeFileSync(path.join(plain, dir, 'hidden.py'), `def ${marker}(): return "${marker.toUpperCase()}_SENTINEL"\n`);
  }
  fs.writeFileSync(path.join(plain, 'visible.txt'), 'PLAIN_VISIBLE_NEEDLE\n');
  ok(await graph('plain_leaf', plain)); await remember(plain);
  for (const dir of ['plain-gitignored', 'plain-cbmignored']) {
    const marker = `plain_${dir.replaceAll('-', '_')}_marker`;
    assert.doesNotMatch(ok(await graph(marker, plain)).stdout, new RegExp(marker));
  }
  fs.writeFileSync(path.join(plain, 'plain.py'), source('plain_changed'));
  await until(async () => /plain_changed/.test(ok(await graph('plain_changed', plain)).stdout), 'non-Git change was not indexed');
  const plainVisible = ok(await wrapper('tgrep-search', ['--', 'PLAIN_VISIBLE_NEEDLE', '.'], plain));
  assert.match(plainVisible.stdout, /PLAIN_VISIBLE_NEEDLE/);
  for (const dir of ['plain-gitignored', 'plain-nativeignored']) {
    const marker = `PLAIN_${dir.replaceAll('-', '_').toUpperCase()}_MARKER`;
    assert.equal((await wrapper('tgrep-search', ['--', marker, '.'], plain)).code, 1);
  }
  console.log('PASS: CBM restart/offline edits and non-Git events.');

  fs.mkdirSync(path.join(temp, 'outside'));
  fs.writeFileSync(path.join(temp, 'outside', 'secret.py'), 'OUTSIDE_NEEDLE\n');
  fs.symlinkSync(path.join(temp, 'outside'), path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const args of [['--', 'OUTSIDE_NEEDLE', 'escape'], ['--follow', '--', 'x', '.'], ['-f', 'escape/secret.py', '--', '.']]) {
    assert.equal((await wrapper('tgrep-search', args)).code, 2);
  }
  assert.equal((await wrapper('cbm-search', ['get_file_outline', '--file-path', 'escape/secret.py'])).code, 2);
  assert.equal((await wrapper('ast-grep-search', ['--pattern', 'x', '--lang', 'python', '--', 'escape'])).code, 2);
  const otherRoot = await run(process.execPath, [path.join(scripts, 'cbm-index.cjs'), plain], plain);
  assert.equal(otherRoot.code, 2);
  ok(await wrapper('tgrep-search', ['--', 'offline_leaf', '.'], root, plain));
  assert.equal((await wrapper('tgrep-search', ['--', 'OUTSIDE_NEEDLE', '.'])).code, 1);
  const ast = ok(await wrapper('ast-grep-search', ['--pattern', 'offline_leaf()', '--lang', 'python', '--json', '--', '.']));
  assert.ok(Array.isArray(JSON.parse(ast.stdout)));
  assert.ok(!fs.existsSync(path.join(root, '.tgrep')));
  assert.ok(!fs.existsSync(path.join(root, '.codebase-memory')));
  console.log('PASS: session-root/cwd, external links, AST and central storage.');
} catch (error) {
  for (const r of [root, plain]) {
    const log = path.join(locations(r).dir, 'daemon.log');
    if (fs.existsSync(log)) console.error(fs.readFileSync(log, 'utf8').slice(-4000));
  }
  throw error;
} finally {
  for (const pid of daemons) await stop(pid);
  const indexBase = path.join(home, 'tgrep', 'index');
  if (fs.existsSync(indexBase)) {
    for (const dir of fs.readdirSync(indexBase)) {
      const infoFile = path.join(indexBase, dir, 'serve.json');
      if (fs.existsSync(infoFile)) await stop(JSON.parse(fs.readFileSync(infoFile, 'utf8')).pid);
    }
  }
  for (const project of projects) ok(await run('codebase-memory-mcp', ['cli', 'delete_project', '--project', project]));
  fs.rmSync(temp, { recursive: true });
}
