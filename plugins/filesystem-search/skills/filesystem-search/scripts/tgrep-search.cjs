#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { tryLock } = require('./process-lock.cjs');
const { canon, codexHome, fail, parseRoot, validateScopes } = require('./root-guard.cjs');

const BACKEND_UNAVAILABLE = 75;
const CORPUS_VERSION = 3;
const VALUE_LONG = new Set([
  'encoding', 'glob', 'iglob', 'type', 'type-not', 'type-add', 'type-clear',
  'max-filesize', 'max-count', 'after-context', 'before-context', 'context',
  'color', 'engine', 'regex-size-limit', 'dfa-size-limit', 'replace',
  'max-columns', 'path-separator', 'sort', 'sortr', 'max-depth',
  'ignore-file', 'threads', 'colors', 'context-separator', 'field-match-separator', 'field-context-separator',
]);
const VALUE_SHORT = new Set(['e', 'f', 'E', 'g', 't', 'T', 'm', 'A', 'B', 'C', 'M', 'j', 'r']);
const WRAPPER_OWNED = new Set(['--index', '--index-path', '--root']);

function indexDirFor(root) {
  const key = process.platform === 'win32' ? root.toLowerCase() : root;
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
  return path.join(codexHome(), 'tgrep', 'index', hash);
}

function parsePreArgs(tokens) {
  const parsed = [];
  const errors = [];
  let hasE = false;
  let hasF = false;
  let files = false;
  let engine = false;
  let size = null;
  let sizeSeen = false;
  let i = 0;
  const takeValue = (name, value, token) => {
    if (value === undefined) errors.push(`missing value for ${token}`);
    else parsed.push({ token, name, value });
  };
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) { errors.push('empty option'); i += 1; continue; }
    if (!token.startsWith('-')) { errors.push(`bare token before --: ${token}`); i += 1; continue; }
    if (token === '--') { errors.push('only one -- delimiter is allowed'); i += 1; continue; }
    if (token === '-') { errors.push('lone short option is invalid'); i += 1; continue; }
    if (WRAPPER_OWNED.has(token) || [...WRAPPER_OWNED].some((x) => token.startsWith(`${x}=`))) {
      errors.push('index/root options are controlled by the wrapper'); i += 1; continue;
    }
    if (token === '--files') { files = true; parsed.push({ token, name: 'files' }); i += 1; continue; }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const name = (eq === -1 ? token.slice(2) : token.slice(2, eq));
      const value = eq === -1 ? undefined : token.slice(eq + 1);
      if (value !== undefined && name !== 'regexp' && name !== 'file' && !VALUE_LONG.has(name)) { errors.push(`boolean option cannot use '=': ${token}`); i += 1; continue; }
      if (name === 'regexp') { hasE = true; if (value === undefined) { if (i + 1 >= tokens.length) errors.push('missing value for --regexp'); else { hasE = true; takeValue(name, tokens[++i], token); } } else takeValue(name, value, token); i += 1; continue; }
      if (name === 'file') { hasF = true; if (value === undefined) { if (i + 1 >= tokens.length) errors.push('missing value for --file'); else takeValue(name, tokens[++i], token); } else takeValue(name, value, token); i += 1; continue; }
      if (VALUE_LONG.has(name)) {
        if (value === undefined) { if (i + 1 >= tokens.length) errors.push(`missing value for --${name}`); else takeValue(name, tokens[++i], token); }
        else takeValue(name, value, token);
        if (name === 'engine') engine = true;
        if (name === 'max-filesize') { size = value === undefined ? tokens[i] : value; sizeSeen = true; }
        i += 1; continue;
      }
      if (name === 'no-max-filesize') { size = null; sizeSeen = true; parsed.push({ token, name }); i += 1; continue; }
      if (name === 'no-index' || name === 'line-regexp' || name === 'multiline-dotall' || name === 'multiline' || name === 'no-ignore-messages' || name === 'no-ignore-files' || name === 'no-ignore-dot' || name === 'no-ignore-exclude' || name === 'no-ignore-global' || name === 'no-ignore-parent' || name === 'no-ignore-vcs' || name === 'hidden' || name === 'ignore-case' || name === 'case-sensitive' || name === 'smart-case' || name === 'fixed-strings' || name === 'word-regexp' || name === 'invert-match' || name === 'files-with-matches' || name === 'files-without-match' || name === 'count' || name === 'only-matching' || name === 'quiet' || name === 'glob-case-insensitive' || name === 'type-list' || name === 'no-encoding' || name === 'with-filename' || name === 'no-filename' || name === 'line-number' || name === 'no-line-number' || name === 'heading' || name === 'no-heading' || name === 'json' || name === 'vimgrep' || name === 'null' || name === 'trim' || name === 'stats' || name === 'no-unicode' || name === 'passthru' || name === 'stop-on-nonmatch' || name === 'column' || name === 'no-column' || name === 'byte-offset' || name === 'max-columns-preview' || name === 'count-matches' || name === 'include-zero' || name === 'pretty' || name === 'no-context-separator' || name === 'sort-files' || name === 'mmap' || name === 'no-mmap' || name === 'line-buffered' || name === 'block-buffered' || name === 'no-config' || name === 'colors' || name === 'debug' || name === 'trace' || name === 'crlf' || name === 'no-crlf' || name === 'pcre2' || name === 'no-unicode' || name === 'pcre2-version' || name === 'no-messages' || name === 'binary' || name === 'text' || name === 'one-file-system' || name === 'follow' || name === 'search-zip' || name === 'ignore-file-case-insensitive' || name === 'no-require-git' || name === 'unrestricted' || name.startsWith('no-ignore')) {
        parsed.push({ token, name }); i += 1; continue;
      }
      errors.push(`unsupported or invalid option: ${token}`); i += 1; continue;
    }
    let cluster = token.slice(1);
    while (cluster) {
      const c = cluster[0];
      if (c === 'u') { parsed.push({ token: `-${c}`, name: 'unrestricted' }); cluster = cluster.slice(1); continue; }
      if (c === 'e' || c === 'f') {
        const name = c === 'e' ? 'regexp' : 'file';
        const attached = cluster.length > 1;
        const rawValue = attached ? cluster.slice(1) : tokens[++i];
        const value = attached && rawValue.startsWith('=') ? rawValue.slice(1) : rawValue;
        if (value === undefined) errors.push(`missing value for -${c}`); else parsed.push({ token: attached ? `-${c}${rawValue}` : `-${c}`, name, value });
        if (c === 'e') hasE = true; else hasF = true;
        cluster = ''; continue;
      }
      if (VALUE_SHORT.has(c)) {
        const attached = cluster.length > 1;
        const rawValue = attached ? cluster.slice(1) : tokens[++i];
        const value = attached && rawValue.startsWith('=') ? rawValue.slice(1) : rawValue;
        const name = c === 'E' ? 'encoding' : (c === 'g' ? 'glob' : (c === 't' ? 'type' : (c === 'T' ? 'type-not' : (c === 'r' ? 'replace' : c))));
        if (value === undefined) errors.push(`missing value for -${c}`); else parsed.push({ token: attached ? `-${c}${rawValue}` : `-${c}`, name, value });
        cluster = ''; continue;
      }
      if ('isSFwvlcoqUHPxanN HILz0.bp'.replace(/ /g, '').includes(c)) { const name = c === 'a' ? 'text' : (c === 'L' ? 'follow' : (c === 'z' ? 'search-zip' : (c === '0' ? 'null' : (c === '.' ? 'hidden' : (c === 'b' ? 'byte-offset' : (c === 'p' ? 'pretty' : c)))))); parsed.push({ token: `-${c}`, name }); cluster = cluster.slice(1); continue; }
      errors.push(`unsupported or invalid option: ${token}`); cluster = ''; 
    }
    i += 1;
  }
  if (files && (hasE || hasF)) errors.push('--files cannot be combined with -e/--regexp or -f/--file');
  return { parsed, errors, hasE, hasF, files, engine, size, sizeSeen };
}

function routeToRg(parsed, mode, query) {
  const routed = [];
  let finalSize;
  let sizeSeen = false;
  let engine = false;
  for (const item of parsed) {
    if (item.name === 'no-max-filesize') { finalSize = null; sizeSeen = true; continue; }
    if (item.name === 'no-require-git') continue;
    if (item.name === 'max-filesize') { finalSize = item.value; sizeSeen = true; continue; }
    if (item.name === 'no-index') continue;
    if (item.name === 'multiline-dotall') { routed.push('--multiline', '--multiline-dotall'); continue; }
    if (item.name === 'engine') engine = true;
    if (item.name === 'files') continue;
    if (item.name === 'regexp') { routed.push('-e', item.value); continue; }
    if (item.name === 'file') { routed.push('-f', item.value); continue; }
    if (item.name === 'unrestricted') { routed.push(item.token === '-u' ? '-u' : item.token); continue; }
    if (item.value === undefined) { routed.push(item.token); continue; }
    if (item.token.startsWith('--') && item.token.includes('=')) {
      routed.push(item.token.slice(0, item.token.indexOf('=')), item.value);
      continue;
    }
    if (item.token.startsWith('-') && !item.token.startsWith('--') && item.token.length > 2) {
      routed.push(item.token.slice(0, 2), item.value);
      continue;
    }
    routed.push(item.token, item.value);
  }
  const args = ['--no-config'];
  if (mode === 'files') args.push('--files');
  if (!engine) args.push('--engine', 'auto');
  args.push(...routed);
  if (sizeSeen && finalSize !== null && finalSize !== undefined) args.push('--max-filesize', finalSize);
  args.push('--', ...query);
  return args;
}

function shouldRouteRg(parsed, mode) {
  return parsed.some((item) => {
    if (item.name === 'no-index' || item.name === 'no-ignore' || item.name === 'no-encoding' || item.name === 'unrestricted' || item.name === 'text' || item.name === 'binary' || (item.name === 'encoding' && item.value !== 'auto') || item.name === 'one-file-system' || item.name === 'ignore-file' || item.name === 'max-filesize' || item.name === 'no-max-filesize' || item.name === 'search-zip' || item.name === 'file') return true;
    if (item.name === 'ignore-file-case-insensitive' && mode === 'files') return true;
    if (item.name.startsWith('no-ignore') && !['no-ignore', 'no-ignore-messages'].includes(item.name)) return true;
    return false;
  });
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function runNative(args, root, timeout) {
  return new Promise((resolve, reject) => {
    cp.execFile('tgrep', args, { cwd: root, encoding: 'utf8', timeout, shell: false,
      windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout + '\n' + stderr);
    });
  });
}

function statusInfo(text) {
  const header = /^\s*Server status for\b/m.test(text);
  const complete = /^\s*Indexing\s*:\s*complete\s*$/im.test(text);
  const coverage = /^\s*Hidden coverage\s*:\s*complete\s*$/im.test(text);
  const active = /^\s*Watcher\s*:\s*active\s*$/im.test(text);
  const watch = text.match(/^\s*Watch mode\s*:\s*(native|auto|poll|starting)\b/im);
  const mode = watch && watch[1].toLowerCase();
  const error = text.match(/^\s*Last reconcile error:\s*(.+)$/im);
  if (error) throw new Error(error[1]);
  const absent = /No index found|No server running|server is not running|^\s*Server\s*:\s*not running\s*$/im.test(text);
  if (!header && !absent) throw new Error('unrecognized tgrep status');
  return { ready: header && complete && coverage && ((active && ['native', 'auto'].includes(mode)) || mode === 'poll'),
    alive: header, pid: Number(text.match(/^\s*PID:\s*(\d+)/m)?.[1]) };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function ensureReady(root, indexDir) {
  fs.mkdirSync(indexDir, { recursive: true });
  let release;
  while (!(release = tryLock(path.join(indexDir, 'lifecycle.sqlite')))) await sleep(250);
  try {
    const status = async () => statusInfo(await runNative(['status', '--no-require-git', '--index-path', indexDir, root], root, 30000));
    let info = await status();
    const markerFile = path.join(indexDir, 'corpus.json');
    const marker = readJson(markerFile);
    const meta = readJson(path.join(indexDir, 'meta.json'));
    if (meta && canon(meta.root_path) !== canon(root)) throw new Error('tgrep index belongs to another root');
    const policyMatches = marker?.version === CORPUS_VERSION && marker.root === canon(root);
    if (info.ready && policyMatches && marker.pid === info.pid) return true;
    if (info.alive && (!policyMatches || marker.pid !== info.pid)) {
      const native = readJson(path.join(indexDir, 'serve.json'));
      if (!meta || !native || native.pid !== info.pid || !Number.isInteger(info.pid) || info.pid <= 1) {
        throw new Error('cannot confirm ownership of the old tgrep daemon');
      }
      process.kill(info.pid, 'SIGTERM');
      const until = Date.now() + 30000;
      for (;;) {
        try { process.kill(info.pid, 0); }
        catch (error) { if (error.code === 'ESRCH') break; throw error; }
        if (Date.now() >= until) throw new Error('old tgrep daemon has not stopped');
        await sleep(250);
      }
      info = await status();
    }
    let child;
    let exited = false;
    if (!info.alive) {
      // A corpus-policy change needs one native rebuild, never a lock deletion.
      if (meta && !policyMatches) await runNative(['index', '--no-require-git', '--exclude', '.git', '--index-path', indexDir, root], root);
      const fd = fs.openSync(path.join(indexDir, 'serve.log'), 'a');
      try {
        child = cp.spawn('tgrep', ['serve', '--no-require-git', '--exclude', '.git', '--index-path', indexDir, root], {
          cwd: root, detached: true, shell: false, windowsHide: true, stdio: ['ignore', fd, fd],
        });
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        child.once('exit', () => { exited = true; });
        child.unref();
        fs.writeFileSync(markerFile, JSON.stringify({ version: CORPUS_VERSION, root: canon(root), pid: child.pid }) + '\n');
      } finally { fs.closeSync(fd); }
    }
    for (;;) {
      if (exited) throw new Error('tgrep daemon exited before readiness');
      info = await status();
      if (info.ready) return true;
      if (!info.alive && !child) throw new Error('tgrep daemon stopped');
      await sleep(250);
    }
  } finally { release(); }
}

(async () => {
  try {
    const [, , rootArg, ...argv] = process.argv;
    const root = parseRoot(rootArg);
    const delimiter = argv.indexOf('--');
    if (delimiter < 0) fail('mandatory -- delimiter is missing');
    const pre = argv.slice(0, delimiter);
    const post = argv.slice(delimiter + 1);
    const parsed = parsePreArgs(pre);
    if (parsed.errors.length) fail(parsed.errors.join('; '));
    const mode = parsed.files ? 'files' : (parsed.hasE || parsed.hasF ? 'expressions' : 'positional');
    if (!post.length || (mode === 'positional' && post.length < 2)) fail('pattern and explicit scope are required');
    const scopes = validateScopes(root, mode === 'positional' ? post.slice(1) : post);
    const query = mode === 'positional' ? [post[0], ...scopes] : scopes;
    if (parsed.parsed.some(x => x.name === 'follow')) fail('--follow is forbidden by the project-root boundary');
    for (const item of parsed.parsed) {
      if (item.name === 'file' || item.name === 'ignore-file') {
        validateScopes(root, [item.value]);
        if (!fs.statSync(path.join(root, item.value)).isFile()) fail('option input must be a file inside root');
      }
    }
    const routeRg = shouldRouteRg(parsed.parsed, mode) || scopes.some(x => fs.statSync(path.join(root, x)).isFile());
    if (routeRg) {
      const result = cp.spawnSync('rg', routeToRg(parsed.parsed, mode, query), { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
      process.exitCode = result.error ? 2 : (result.status == null ? 2 : result.status);
      return;
    }
    const indexDir = indexDirFor(root);
    try { await ensureReady(root, indexDir); } catch (error) {
      console.error('TGREP_BACKEND_UNAVAILABLE: ' + error.message);
      process.exitCode = BACKEND_UNAVAILABLE;
      return;
    }
    const forward = (x) => x.value !== undefined && ((x.token.startsWith('--') && x.token.includes('=')) || (x.token.startsWith('-') && !x.token.startsWith('--') && x.token.length > 2)) ? [x.token] : [x.token, ...(x.value === undefined ? [] : [x.value])];
    const forwarded = parsed.parsed.filter((x) => !['files', 'no-ignore', 'no-require-git'].includes(x.name)).flatMap(forward);
    const command = mode === 'files' ? ['--index-path', indexDir, '--files', ...forwarded, '--', ...scopes] : ['search', '--index-path', indexDir, '--no-require-git', ...forwarded, '--', ...query];
    const result = cp.spawnSync('tgrep', command, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    if (result.error) { console.error(`TGREP_BACKEND_UNAVAILABLE: ${result.error.message}`); process.exitCode = BACKEND_UNAVAILABLE; return; }
    process.exitCode = result.status == null ? 2 : result.status;
  } catch (error) {
    if (error.message !== '__wrapper_exit__') { console.error(error.message); process.exitCode = 2; }
  }
})();
