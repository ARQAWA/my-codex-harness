// Explicit native tgrep lifecycle acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/filesystem-search/scripts/tgrep-search.cjs');
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tgrep-lifecycle-')));
const root = path.join(temp, 'root'); const home = path.join(temp, 'home');
fs.mkdirSync(root); fs.mkdirSync(home);
const canonical = process.platform === 'win32' ? root.toLowerCase() : root;
const index = path.join(home, 'tgrep', 'index', crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 12));
const env = { ...process.env, CODEX_HOME: home, FSSEARCH_SESSION_ROOT: root };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (exe, args) => new Promise(resolve => execFile(exe, args, { cwd: root, env, timeout: 60000, windowsHide: true },
  (error, stdout, stderr) => resolve({ code: error?.code || 0, stdout, stderr })));
const query = () => run(process.execPath, [script, root, '-g', '*.py', '--stats', '--', 'MAIN_LIFECYCLE', '.']);
const ok = r => { assert.equal(r.code, 0, r.stderr); return r; };
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } };
async function until(fn) {
  const end = Date.now() + 60000;
  do { if (await fn()) return; await sleep(100); } while (Date.now() < end);
  throw new Error('tgrep lifecycle condition did not complete');
}
const pids = new Set();
try {
  ok(await run('git', ['init', '-q']));
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.py\n');
  fs.writeFileSync(path.join(root, 'main.py'), 'MAIN_LIFECYCLE\n');
  fs.writeFileSync(path.join(root, 'ignored.py'), 'IGNORED_LIFECYCLE\n');
  fs.writeFileSync(path.join(root, '.git', 'internal.py'), 'GIT_INTERNAL_LIFECYCLE\n');
  fs.mkdirSync(index, { recursive: true });
  const fd = fs.openSync(path.join(index, 'legacy.log'), 'a');
  const old = spawn('tgrep', ['serve', '--index-path', index, root], { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  await new Promise((resolve, reject) => { old.once('spawn', resolve); old.once('error', reject); });
  pids.add(old.pid);
  await until(async () => /Indexing:\s+complete/.test((await run('tgrep', ['status', '--index-path', index, root])).stdout));
  const lockInode = fs.statSync(path.join(index, 'serve.lock')).ino;
  const migrated = ok(await query()); assert.match(migrated.stdout + migrated.stderr, /via server/);
  assert.equal((await run(process.execPath, [script, root, '-g', '*.py', '--', 'IGNORED_LIFECYCLE', '.'])).code, 1);
  assert.equal((await run(process.execPath, [script, root, '-g', '*.py', '--', 'GIT_INTERNAL_LIFECYCLE', '.'])).code, 1);
  assert.ok(!alive(old.pid)); pids.delete(old.pid);
  const marker = JSON.parse(fs.readFileSync(path.join(index, 'corpus.json'), 'utf8'));
  pids.add(marker.pid);
  assert.notEqual(marker.pid, old.pid);
  assert.equal(marker.version, 3);
  assert.equal(fs.statSync(path.join(index, 'serve.lock')).ino, lockInode);
  ok(await query());
  assert.equal(JSON.parse(fs.readFileSync(path.join(index, 'serve.json'), 'utf8')).pid, marker.pid);
  process.kill(marker.pid, 'SIGKILL');
  await until(() => !alive(marker.pid)); pids.delete(marker.pid);
  const restarted = ok(await query()); assert.match(restarted.stdout + restarted.stderr, /via server/);
  const newPid = JSON.parse(fs.readFileSync(path.join(index, 'serve.json'), 'utf8')).pid;
  pids.add(newPid);
  assert.notEqual(newPid, marker.pid);
  assert.equal(fs.statSync(path.join(index, 'serve.lock')).ino, lockInode);
  console.log('PASS: tgrep legacy corpus migration, gitignore exclusion, warm reuse, crash/restart and preserved native lock.');
} finally {
  const info = path.join(index, 'serve.json');
  if (fs.existsSync(info)) pids.add(JSON.parse(fs.readFileSync(info, 'utf8')).pid);
  for (const pid of pids) { if (alive(pid)) process.kill(pid, 'SIGTERM'); await until(() => !alive(pid)); }
  fs.rmSync(temp, { recursive: true });
}
