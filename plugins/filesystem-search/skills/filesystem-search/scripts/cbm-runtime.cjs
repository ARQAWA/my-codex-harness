'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { canon, codexHome, parseRoot, validateScopes } = require('./root-guard.cjs');
const { tryLock } = require('./process-lock.cjs');
const READ_TOOLS = new Set(['search_graph', 'query_graph', 'trace_path', 'get_code_snippet',
  'get_file_outline', 'get_graph_schema', 'get_architecture', 'search_code', 'check_index_coverage']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function locations(root) {
  const key = hash(canon(root)).slice(0, 24);
  const dir = path.join(codexHome(), 'filesystem-search', 'cbm', key);
  // Unix socket paths have a small platform limit; state stays in Codex home.
  const socketKey = hash(`${canon(codexHome())}\0${canon(root)}`).slice(0, 32);
  const socket = process.platform === 'win32' ? `\\\\.\\pipe\\fssearch-cbm-${socketKey}`
    : `/tmp/fssearch-cbm-${socketKey}.sock`;
  return { dir, socket };
}

function validateQuery(root, tool, args) {
  if (!READ_TOOLS.has(tool)) throw new Error('unsupported read-only CBM tool');
  if (!Array.isArray(args)) throw new Error('CBM arguments must be CLI flags');
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (typeof token !== 'string' || !/^--[a-z][a-z0-9-]*(?:=|$)/.test(token)) {
      throw new Error('CBM arguments must be --flag value or --flag=value');
    }
    const eq = token.indexOf('=');
    const key = eq < 0 ? token : token.slice(0, eq);
    if (['--project', '--repo-path', '--root', '--args-file', '--target-projects', '--persistence'].includes(key)) {
      throw new Error(`${key} is controlled by the wrapper or is not a search option`);
    }
    const value = eq < 0 ? args[++i] : token.slice(eq + 1);
    if (typeof value !== 'string') throw new Error(`missing value for ${key}`);
    if (['--file', '--file-path', '--path'].includes(key)) validateScopes(root, [value]);
  }
}

function connect(socket) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socket);
    client.once('error', reject);
    client.once('connect', () => { client.removeListener('error', reject); resolve(client); });
  });
}

function watcherExecutable() {
  const targets = {
    'darwin-arm64': 'aarch64-apple-darwin',
    'linux-x64': 'x86_64-unknown-linux-musl',
    'win32-x64': 'x86_64-pc-windows-gnu',
  };
  const target = targets[`${process.platform}-${process.arch}`];
  if (!target) throw new Error(`CBM watcher is not packaged for ${process.platform}-${process.arch}`);
  const packageRoot = path.resolve(__dirname, '../../..');
  const { version } = JSON.parse(fs.readFileSync(path.join(packageRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return path.join(codexHome(), 'tools', 'filesystem-search', 'cbm-watcher', version, `cbm-watcher${suffix}`);
}

async function request(root, op, tool, args = []) {
  const loc = locations(root);
  let client;
  let child;
  let exited = false;
  let launchError;
  for (;;) {
    try { client = await connect(loc.socket); break; }
    catch (error) {
      if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error;
      if (child && exited) {
        const release = tryLock(path.join(loc.dir, 'owner.sqlite'));
        if (release) {
          release();
          await sleep(250);
          try { client = await connect(loc.socket); break; } catch {}
          throw new Error(`CBM daemon could not start (${launchError || 'process exited'}); see ${path.join(loc.dir, 'daemon.log')}`);
        }
      }
      if (!child) {
        fs.mkdirSync(loc.dir, { recursive: true });
        const fd = fs.openSync(path.join(loc.dir, 'daemon.log'), 'a');
        try {
          child = cp.spawn(watcherExecutable(), [root], {
            cwd: root, env: { ...process.env, FSSEARCH_SESSION_ROOT: root },
            detached: true, shell: false, windowsHide: true, stdio: ['ignore', fd, fd],
          });
          child.once('error', error => { launchError = error.message; exited = true; });
          child.once('exit', (code, signal) => { launchError ||= `process exited (${signal || code})`; exited = true; });
          child.unref();
        } finally { fs.closeSync(fd); }
      }
      await sleep(100);
    }
  }
  return new Promise((resolve, reject) => {
    let data = '';
    let ended = false;
    client.setEncoding('utf8');
    client.on('error', reject);
    client.on('data', chunk => { data += chunk; });
    client.on('end', () => {
      ended = true;
      try { resolve(JSON.parse(data)); } catch { reject(new Error('CBM daemon disconnected before returning a result')); }
      client.end();
    });
    client.on('close', () => {
      if (!ended) reject(new Error('CBM daemon disconnected before returning a result'));
    });
    client.write(JSON.stringify({ root: canon(root), op, tool, args }) + '\n');
  });
}

async function daemon(root) {
  const loc = locations(root);
  fs.mkdirSync(loc.dir, { recursive: true });
  const release = tryLock(path.join(loc.dir, 'owner.sqlite'));
  if (!release) return; // Another starter owns both initialization and the socket.
  if (process.platform !== 'win32' && fs.existsSync(loc.socket)) fs.unlinkSync(loc.socket);
  const children = new Set();
  let project = null;
  let baseline = null;
  let lastError = null;
  let inFlight = null;
  let interval = 5000;
  let gitRoot = null;
  let generation = 0;
  let changedAt = 0;
  let watcher;
  let timer;
  let stopping = false;

  function run(executable, args, timeout) {
    return new Promise((resolve, reject) => {
      const child = cp.execFile(executable, args, {
        cwd: root, env: { ...process.env, CBM_ALLOWED_ROOT: root },
        windowsHide: true, shell: false, timeout, maxBuffer: 64 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        children.delete(child);
        if (error) { error.message = stderr.trim() || error.message; error.stdout = stdout; error.stderr = stderr; reject(error); }
        else resolve({ stdout, stderr });
      });
      children.add(child);
    });
  }
  const git = args => run('git', ['-C', root, ...args], 30000);
  const cli = (tool, args) => run('codebase-memory-mcp', ['cli', tool, ...args]);

  async function identity() {
    let offset = 0;
    for (;;) {
      const { stdout } = await cli('list_projects', ['--detail', 'identity', '--format', 'json', '--offset', String(offset)]);
      const page = JSON.parse(stdout);
      if (!Array.isArray(page.projects)) throw new Error('CBM returned invalid project identities');
      const item = page.projects.find(p => typeof p.root_path === 'string' && canon(p.root_path) === canon(root));
      if (item && typeof item.name === 'string' && item.name) return item.name;
      if (!page.has_more) return null;
      if (!Number.isInteger(page.next_offset) || page.next_offset <= offset) throw new Error('CBM identity pagination did not advance');
      offset = page.next_offset;
    }
  }

  async function observe() {
    if (!gitRoot) return String(generation);
    let head = '';
    try { head = (await git(['rev-parse', '--verify', 'HEAD'])).stdout.trim(); }
    catch (error) { if (error.code !== 128) throw error; } // A repository without a first commit.
    const status = (await git(['status', '--porcelain=v1', '-uall', '-z', '--', '.'])).stdout;
    const digest = crypto.createHash('sha256').update(head).update('\0').update(status);
    const entries = status.split('\0');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;
      const names = [entry.slice(3)];
      if (/[RC]/.test(entry.slice(0, 2))) names.push(entries[++i]);
      for (const name of names) {
        if (!name) continue;
        const file = path.resolve(gitRoot, name);
        const relative = path.relative(root, file);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
        try {
          const real = fs.realpathSync.native(file);
          const rel = path.relative(root, real);
          if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue;
          const stat = fs.lstatSync(file, { bigint: true });
          digest.update(`${name}\0${stat.size}\0${stat.mtimeNs}\0`);
        } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
      }
    }
    return digest.digest('hex');
  }

  function refresh(observed) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const before = observed === undefined ? await observe() : observed;
      const result = await cli('index_repository', ['--repo-path', root, '--mode', 'full']);
      const data = JSON.parse(result.stdout);
      if (data.isError || data.error || data.status === 'error') throw new Error(result.stdout);
      const next = typeof data.project === 'string' && data.project ? data.project : await identity();
      if (!next) throw new Error('CBM index completed without a usable project identity');
      project = next;
      baseline = before;
      lastError = null;
      if (!gitRoot && baseline === String(generation)) changedAt = 0;
      if (gitRoot) {
        const files = (await git(['ls-files', '-z', '--', '.'])).stdout.split('\0').filter(Boolean).length;
        interval = Math.min(60000, 5000 + Math.floor(files / 500) * 1000);
      }
      return { ...result, project };
    })().catch(error => { lastError = error.message; console.error(`CBM_UPDATE_FAILED: ${lastError}`); throw error; })
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  const server = net.createServer({ allowHalfOpen: true }, client => {
    let input = '';
    let accepted = false;
    client.setEncoding('utf8');
    client.on('error', () => {});
    client.on('data', chunk => {
      if (accepted) return;
      input += chunk;
      const newline = input.indexOf('\n');
      if (newline < 0) return;
      accepted = true;
      void handleRequest(input.slice(0, newline));
    });
    client.on('end', () => {
      if (accepted) return;
      accepted = true;
      client.end(JSON.stringify({ code: 75, pid: process.pid, project, stdout: '',
        stderr: 'CBM_BACKEND_UNAVAILABLE: request ended before newline\n' }));
    });

    async function handleRequest(line) {
      let result;
      try {
        const message = JSON.parse(line);
        if (message.root !== canon(root)) throw new Error('CBM daemon root mismatch');
        if (!['ready', 'refresh', 'query'].includes(message.op)) throw new Error('invalid CBM operation');
        if (message.op === 'query') validateQuery(root, message.tool, message.args);
        await initialized;
        if (message.op === 'refresh') {
          const before = await observe();
          if (inFlight) {
            const current = await inFlight;
            result = baseline === before ? current : await refresh(before);
          } else result = await refresh(before);
        } else {
          if (!project) await refresh();
          if (message.op === 'query') {
            try { result = await cli(message.tool, ['--project', project, ...message.args]); }
            catch (error) {
              if (!Number.isInteger(error.code)) throw error;
              result = { code: error.code, stdout: error.stdout, stderr: error.stderr };
            }
          } else result = {};
        }
        result = { code: 0, ...result, project, pid: process.pid,
          stderr: `${lastError ? `CBM_INDEX_STALE: ${lastError}\n` : ''}${result.stderr || ''}` };
      } catch (error) {
        result = { code: 75, pid: process.pid, project, stdout: '', stderr: `CBM_BACKEND_UNAVAILABLE: ${error.message}\n` };
      }
      client.end(JSON.stringify(result));
    }
  });

  function stop() {
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    watcher?.close();
    for (const child of children) child.kill('SIGTERM');
    server.close();
    if (process.platform !== 'win32') { try { fs.unlinkSync(loc.socket); } catch {} }
    release();
    process.exit(0);
  }
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  server.on('error', error => { console.error(error.message); stop(); });
  await new Promise(resolve => server.listen(loc.socket, resolve));
  if (process.platform !== 'win32') fs.chmodSync(loc.socket, 0o600);

  const initialized = (async () => {
    try {
      const cdup = (await git(['rev-parse', '--show-cdup'])).stdout.trim();
      const tracked = (await git(['ls-files', '-z', '--', '.'])).stdout;
      if (fs.existsSync(path.join(root, '.git')) || tracked) gitRoot = path.resolve(root, cdup);
    } catch (error) { if (error.code !== 128 && error.code !== 'ENOENT') throw error; }
    if (!gitRoot) {
      watcher = fs.watch(root, { recursive: true }, () => {
        generation++;
        if (!changedAt) {
          changedAt = Date.now();
          clearTimeout(timer);
          timer = setTimeout(tick, 5000);
        }
      });
      watcher.on('error', error => { lastError = error.message; console.error(`CBM_WATCH_FAILED: ${lastError}`); stop(); });
    }
    project = await identity();
  })();

  async function tick() {
    if (stopping) return;
    try {
      if (!fs.existsSync(root) || canon(root) !== root) return stop();
      await initialized;
      if (!inFlight) {
        const observed = await observe();
        if ((baseline !== observed || lastError) && (gitRoot || Date.now() - changedAt >= 5000)) await refresh(observed);
      }
    } catch (error) { lastError = error.message; }
    timer = setTimeout(tick, interval);
  }
  initialized.then(() => refresh().catch(() => {}), error => { console.error(error.message); stop(); });
  timer = setTimeout(tick, interval);
}

if (require.main === module) {
  try { daemon(canon(parseRoot(process.argv[2]))).catch(error => { console.error(error.message); process.exit(75); }); }
  catch (error) { if (error.message !== '__wrapper_exit__') console.error(error.message); }
}
module.exports = { request, validateQuery, locations, watcherExecutable };
