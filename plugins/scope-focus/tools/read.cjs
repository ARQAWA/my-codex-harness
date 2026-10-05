'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const USAGE = 'usage: node read.cjs [--sizes [--files]] [--budget N] [--from PATH] [--skip-tests] [--lines A-B] [-n] [PATH...]';
const DEFAULT_BUDGET = 90000;
const MAX_BUDGET = 200000;
const MAX_LINE = 2000;
const WALK_SKIP = new Set(['.git', 'node_modules', 'target', 'dist', 'build', '.venv', 'venv', '__pycache__']);
const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock', 'uv.lock', 'Gemfile.lock', 'composer.lock']);
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'spec', 'specs']);
const TEST_NAMES = [/^.*_test\..*$/, /^.*\.test\..*$/, /^.*\.spec\..*$/, /^test_.*\.py$/, /^conftest\.py$/];

const cwd = process.cwd();
const slash = p => p.split(path.sep).join('/');
const shown = p => slash(path.relative(cwd, path.resolve(cwd, p))) || '.';
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const tokens = bytes => Math.ceil(bytes / 4);
const quote = p => (/^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`);

function parseArgs(argv) {
  const o = { sizes: false, files: false, budget: DEFAULT_BUDGET, clamped: false, from: null, skipTests: false, lines: null, numbers: false, paths: [] };
  let literal = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (literal || !a.startsWith('-')) o.paths.push(a);
    else if (a === '--') literal = true;
    else if (a === '--sizes') o.sizes = true;
    else if (a === '--files') o.files = true;
    else if (a === '--skip-tests') o.skipTests = true;
    else if (a === '-n') o.numbers = true;
    else if (a === '--from') o.from = shown(value());
    else if (a === '--budget') {
      const v = value();
      if (!/^\d+$/.test(v) || Number(v) < 1) throw new Error(`bad --budget: ${v}`);
      o.budget = Number(v);
    } else if (a === '--lines') {
      const v = value();
      const m = /^(\d+)-(\d+)$/.exec(v);
      if (!m || Number(m[1]) < 1 || Number(m[2]) < Number(m[1])) throw new Error(`bad --lines: ${v}`);
      o.lines = [Number(m[1]), Number(m[2])];
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (o.files && !o.sizes) throw new Error('--files needs --sizes');
  if (o.budget > MAX_BUDGET) {
    o.budget = MAX_BUDGET;
    o.clamped = true;
  }
  return o;
}

function gitFiles(targets) {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8' });
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') return null;
  const listed = spawnSync('git', ['--literal-pathspecs', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...targets], { cwd, encoding: 'utf8', maxBuffer: 1 << 29 });
  return listed.status === 0 ? listed.stdout.split('\0').filter(Boolean) : null;
}

function walk(rel, out) {
  let stat;
  try {
    stat = fs.statSync(path.resolve(cwd, rel));
  } catch {
    return;
  }
  if (stat.isFile()) out.push(rel);
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(path.resolve(cwd, rel), { withFileTypes: true })) {
    const child = rel === '.' ? entry.name : `${rel}/${entry.name}`;
    if (!entry.isDirectory()) out.push(child);
    else if (!WALK_SKIP.has(entry.name)) walk(child, out);
  }
}

function isFile(p) {
  try {
    return fs.statSync(path.resolve(cwd, p)).isFile();
  } catch {
    return false;
  }
}

function listFiles(paths) {
  const targets = (paths.length ? paths : ['.']).map(p => {
    if (!fs.existsSync(path.resolve(cwd, p))) throw new Error(`no such path: ${p}`);
    return shown(p);
  });
  let list = gitFiles(targets);
  if (list === null) {
    list = [];
    for (const target of targets) walk(target, list);
  }
  return [...new Set(list)].filter(isFile).sort(compare);
}

const isLockfile = p => LOCKFILES.has(p.slice(p.lastIndexOf('/') + 1));

function isTestFile(p) {
  const segments = p.split('/');
  const name = segments.pop();
  return segments.some(s => TEST_DIRS.has(s)) || TEST_NAMES.some(re => re.test(name));
}

// A `#[cfg(test)]` line directly followed by a `mod ` line starts an omitted range that ends at the
// module's closing line (same indent as the `mod` line), or at the end of the file when none is found.
function rustTestRanges(raw) {
  const ranges = [];
  for (let i = 0; i + 1 < raw.length; i++) {
    if (!/^\s*#\[cfg\(test\)\]\s*$/.test(raw[i]) || !/^\s*mod\s/.test(raw[i + 1])) continue;
    const head = raw[i + 1];
    let end = raw.length - 1;
    if (!head.includes('{') || head.trimEnd().endsWith('}')) end = i + 1;
    else {
      const closing = `${/^\s*/.exec(head)[0]}}`;
      for (let j = i + 2; j < raw.length; j++) {
        if (raw[j].trimEnd() === closing) {
          end = j;
          break;
        }
      }
    }
    ranges.push([i, end]);
    i = end;
  }
  return ranges;
}

// Returns null for a binary file; entries keep original line numbers (n..e) and their printed size.
function render(file, o) {
  const buf = fs.readFileSync(path.resolve(cwd, file));
  if (buf.subarray(0, 8192).includes(0)) return null;
  const raw = buf.toString('utf8').split(/\r?\n/);
  if (raw[raw.length - 1] === '') raw.pop();
  const ranges = o.skipTests && file.endsWith('.rs') ? rustTestRanges(raw) : [];
  const entries = [];
  let bytes = 0;
  const add = (n, e, text) => {
    const size = Buffer.byteLength((o.numbers ? `${n}\t` : '') + text) + 1;
    entries.push({ n, e, text, size });
    bytes += size;
  };
  let r = 0;
  for (let i = 0; i < raw.length; i++) {
    if (r < ranges.length && i === ranges[r][0]) {
      const [start, end] = ranges[r++];
      add(start + 1, end + 1, `[test module omitted: ${end - start + 1} lines]`);
      i = end;
      continue;
    }
    const text = raw[i];
    add(i + 1, i + 1, text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}[…${text.length - MAX_LINE} chars]` : text);
  }
  return { entries, lines: raw.length, tok: tokens(bytes) };
}

const printLine = (e, o) => `${o.numbers ? `${e.n}\t` : ''}${e.text}\n`;

// Number of leading entries that fit in maxBytes; at least one, so every call makes progress.
function take(entries, maxBytes) {
  let used = 0;
  let n = 0;
  while (n < entries.length && (n === 0 || used + entries[n].size <= maxBytes)) used += entries[n++].size;
  return n;
}

const skipSuffix = skip => {
  const parts = [];
  if (skip.binary) parts.push(`binary ${skip.binary}`);
  if (skip.lock) parts.push(`lockfile ${skip.lock}`);
  if (skip.test) parts.push(`test ${skip.test}`);
  return parts.length ? `; skipped: ${parts.join(', ')}` : '';
};

function sizesText(infos, o, skip) {
  const add = (t, f) => {
    t.files++;
    t.lines += f.lines;
    t.tok += f.tok;
  };
  const fmt = (label, t) => `${label} ${t.files} files, ${t.lines} lines, ~${t.tok} tok`;
  const total = { files: 0, lines: 0, tok: 0 };
  const dirs = new Map();
  const out = [];
  for (const f of infos) {
    add(total, f);
    if (o.files) {
      out.push(`${f.path} ${f.lines} lines, ~${f.tok} tok\n`);
      continue;
    }
    const parts = f.path.split('/');
    parts.pop();
    let dir = '';
    for (const part of parts) {
      dir += `${part}/`;
      if (!dirs.has(dir)) dirs.set(dir, { files: 0, lines: 0, tok: 0 });
      add(dirs.get(dir), f);
    }
  }
  for (const [dir, t] of dirs) out.push(`${fmt(dir, t)}\n`);
  out.push(`${fmt('total:', total)}${skipSuffix(skip)}\n`);
  return out.join('');
}

function linesText(infos, o) {
  if (infos.length !== 1) throw new Error(`--lines needs exactly one file, found ${infos.length}`);
  const f = infos[0];
  const [a, requested] = o.lines;
  if (a > f.lines) throw new Error(`${f.path} has ${f.lines} lines`);
  const b = Math.min(requested, f.lines);
  const entries = render(f.path, o).entries.filter(e => e.e >= a && e.n <= b);
  const n = take(entries, o.budget * 4);
  const out = [];
  if (o.clamped) out.push(`=== budget clamped to ${MAX_BUDGET} tokens\n`);
  out.push(`=== ${f.path} lines ${a}-${b} of ${f.lines}\n`, ...entries.slice(0, n).map(e => printLine(e, o)));
  if (n < entries.length) out.push(`=== more: --lines ${entries[n - 1].e + 1}-${b} ${quote(f.path)}\n`);
  return out.join('');
}

function contentText(infos, o, skip) {
  const out = [];
  if (o.clamped) out.push(`=== budget clamped to ${MAX_BUDGET} tokens\n`);
  let i = 0;
  if (o.from !== null) {
    i = infos.findIndex(f => f.path === o.from);
    if (i < 0) throw new Error(`--from path is not in the file set: ${o.from}`);
  }
  const header = f => `=== ${f.path} (${f.lines} lines, ~${f.tok} tok)\n`;
  let used = 0;
  let printed = 0;
  let partial = false;
  if (i < infos.length && infos[i].tok > o.budget) {
    const f = infos[i++];
    const entries = render(f.path, o).entries;
    const n = take(entries, o.budget * 4);
    out.push(header(f), ...entries.slice(0, n).map(e => printLine(e, o)));
    if (n < entries.length) out.push(`=== more: --lines ${entries[n - 1].e + 1}-${f.lines} ${quote(f.path)}\n`);
    partial = true;
  } else {
    while (i < infos.length && used + infos[i].tok <= o.budget) {
      const f = infos[i++];
      out.push(header(f), ...render(f.path, o).entries.map(e => printLine(e, o)));
      used += f.tok;
      printed++;
    }
  }
  const rest = infos.slice(i);
  if (rest.length) out.push(`=== more: ${rest.length} files, ~${rest.reduce((sum, f) => sum + f.tok, 0)} tok; next: --from ${quote(rest[0].path)}\n`);
  else if (!partial) out.push(`=== end: ${printed} files, ~${used} tok${skipSuffix(skip)}\n`);
  return out.join('');
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const skip = { binary: 0, lock: 0, test: 0 };
  const infos = [];
  for (const file of listFiles(o.paths)) {
    if (isLockfile(file)) skip.lock++;
    else if (o.skipTests && isTestFile(file)) skip.test++;
    else {
      const r = render(file, o);
      if (r === null) skip.binary++;
      else infos.push({ path: file, lines: r.lines, tok: r.tok });
    }
  }
  if (o.sizes) process.stdout.write(sizesText(infos, o, skip));
  else if (o.lines) process.stdout.write(linesText(infos, o));
  else process.stdout.write(contentText(infos, o, skip));
}

process.stdout.on('error', error => {
  if (error.code !== 'EPIPE') throw error;
});

try {
  main();
} catch (error) {
  process.stderr.write(`read.cjs: ${error.message}\n${USAGE}\n`);
  process.exitCode = 1;
}
