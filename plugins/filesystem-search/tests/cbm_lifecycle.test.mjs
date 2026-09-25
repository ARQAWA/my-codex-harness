import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { request, locations, watcherExecutable } = require('../skills/filesystem-search/scripts/cbm-runtime.cjs');
if (process.platform === 'win32') {
  console.log('SKIP: lifecycle fixture uses a POSIX CLI shim; Windows is covered by native acceptance.');
  process.exit(0);
}
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cbm-lifecycle-')));
const root = path.join(temp, 'root'); const state = path.join(temp, 'state');
const home = path.join(temp, 'home'); const cliDir = path.join(temp, 'bin');
for (const dir of [root, state, home, cliDir]) fs.mkdirSync(dir);
process.env.CODEX_HOME = home;
process.env.FSSEARCH_SESSION_ROOT = root;
const fixture = path.join(here, 'cbm-cli-fixture.cjs');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const cli = path.join(cliDir, 'codebase-memory-mcp');
fs.writeFileSync(cli, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`);
fs.chmodSync(cli, 0o755);
process.env.PATH = `${cliDir}${path.delimiter}${process.env.PATH}`;
const target = process.platform === 'darwin' ? 'aarch64-apple-darwin' : 'x86_64-unknown-linux-musl';
const suffix = process.platform === 'win32' ? '.exe' : '';
const source = path.join(path.dirname(here), 'bin', target, `cbm-watcher${suffix}`);
fs.mkdirSync(path.dirname(watcherExecutable()), { recursive: true });
fs.copyFileSync(source, watcherExecutable());
fs.chmodSync(watcherExecutable(), 0o755);
process.env.FSSEARCH_FIXTURE_STATE = state;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const calls = () => fs.existsSync(path.join(state, 'calls.jsonl')) ? fs.readFileSync(path.join(state, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
const starts = () => calls().filter(x => x.event === 'start').length;
const query = () => request(root, 'query', 'search_graph', ['--format', 'json']);
async function until(fn) {
  const end = Date.now() + 20000;
  do { if (await fn()) return; await sleep(50); } while (Date.now() < end);
  throw new Error('lifecycle condition did not complete');
}
let pid;
try {
  fs.writeFileSync(path.join(root, 'probe.py'), 'first');
  const pair = await Promise.all([query(), query()]);
  pid = pair[0].pid;
  for (const item of pair) { assert.equal(item.code, 0, item.stderr); assert.equal(item.pid, pid); }
  assert.equal(starts(), 1, `one cold index for simultaneous callers: ${JSON.stringify(calls())}`);
  await sleep(5500);
  assert.equal(starts(), 1, 'unchanged project must not reindex');

  const crashed = pid;
  process.kill(crashed, 'SIGKILL');
  await until(() => { try { process.kill(crashed, 0); return false; } catch (e) { return e.code === 'ESRCH'; } });
  const restarted = await query();
  pid = restarted.pid;
  assert.equal(restarted.code, 0, restarted.stderr);
  assert.notEqual(pid, crashed);
  assert.match(restarted.stdout, /first/);
  assert.equal((await request(root, 'refresh')).code, 0);

  fs.writeFileSync(path.join(root, 'probe.py'), 'second');
  const previous = starts();
  const refreshing = request(root, 'refresh');
  await until(() => starts() > previous);
  fs.writeFileSync(path.join(root, 'probe.py'), 'third during index');
  assert.equal((await refreshing).code, 0);
  await until(() => JSON.parse(fs.readFileSync(path.join(state, 'graph.json'), 'utf8')).snapshot === 'third during index');
  assert.ok(starts() >= previous + 2, 'edit during index remains pending');

  fs.writeFileSync(path.join(state, 'fail'), 'fail');
  fs.writeFileSync(path.join(root, 'probe.py'), 'fourth');
  assert.equal((await request(root, 'refresh')).code, 75);
  const old = await query();
  assert.equal(old.code, 0); assert.match(old.stderr, /CBM_INDEX_STALE/); assert.match(old.stdout, /third during index/);
  fs.unlinkSync(path.join(state, 'fail'));
  await until(() => JSON.parse(fs.readFileSync(path.join(state, 'graph.json'), 'utf8')).snapshot === 'fourth');
  await until(async () => !(await query()).stderr.includes('CBM_INDEX_STALE'));
  fs.rmSync(root, { recursive: true });
  await until(() => { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } });
  assert.ok(fs.existsSync(path.join(state, 'graph.json')), 'root removal preserves graph');
  pid = null;
  console.log('PASS: CBM singleton, crash/restart, idle dirty state, changes during indexing, failure/retry and missing root.');
} catch (error) {
  const log = path.join(locations(root).dir, 'daemon.log');
  if (fs.existsSync(log)) console.error(fs.readFileSync(log, 'utf8').slice(-3000));
  throw error;
} finally {
  if (pid) { try { process.kill(pid, 'SIGTERM'); } catch {} await sleep(150); }
  fs.rmSync(temp, { recursive: true });
}
