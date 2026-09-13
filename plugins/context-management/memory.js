'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { StringDecoder } = require('node:string_decoder');

const MAX_NOTE_BYTES = 1_000_000;
const MAX_STDIN_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const IMPORT_CHUNK_BYTES = 4 * 1024 * 1024;
const IMPORT_CHUNK_RECORDS = 256;
const MAX_IMPORT_LINE_BYTES = 16 * 1024 * 1024;
const MAX_IMPORT_DEPTH = 32;
const IMPORT_READ_BYTES = 64 * 1024;
const DEFAULT_AGENT = '/root';
const SUPPORTED_ROLLOUT_VERSIONS = ['0.153.4', '0.154.0-alpha.6.2'];

class MemoryError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const home = () => os.homedir();
const expand = (p) => {
  if (typeof p !== 'string' || !p) return p;
  return p.startsWith('~/') ? path.join(home(), p.slice(2)) : p;
};
const now = () => Date.now() / 1000;
const iso = (n) => n == null ? null : new Date(Number(n) * 1000).toISOString();
const uuid = () => crypto.randomUUID();
const bytes = (s) => Buffer.byteLength(String(s), 'utf8');
const points = (s) => Array.from(String(s));
const compact = (x) => JSON.stringify(x);
const validId = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const savepointName = (prefix) => `${prefix}_${uuid().replaceAll('-', '')}`;
const splitLines = (text) => (String(text).match(/[^\r\n\v\f\x1c-\x1e\x85\u2028\u2029]*(?:\r\n|[\r\n\v\f\x1c-\x1e\x85\u2028\u2029]|$)/gu) || []).filter(Boolean);
const integer = (v, name, fallback, min = 1) => {
  const n = v === undefined ? fallback : v;
  if (!Number.isInteger(n) || n < min) throw new MemoryError('invalid_request', `${name} must be an integer >= ${min}`);
  return n;
};
const bool = (v, name, fallback) => {
  const x = v === undefined ? fallback : v;
  if (typeof x !== 'boolean') throw new MemoryError('invalid_request', `${name} must be boolean`);
  return x;
};
function defaultDataDir() {
  return process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(home(), 'AppData', 'Local'), 'ctx-mgr-local-native')
    : path.join(home(), '.local', 'share', 'ctx-mgr-local-native');
}

function defaults() {
  const data = defaultDataDir();
  return {
    settings_path: path.join(data, 'settings.json'),
    db_path: path.join(data, 'memory.sqlite3'),
    codex_home: path.join(home(), '.codex'),
    max_output_bytes: 64 * 1024,
    skill_path: path.resolve(__dirname, 'skills', 'local-context-memory', 'SKILL.md'),
    node_path: process.execPath,
    cli_path: path.resolve(__dirname, 'memory.js'),
    log_path: path.join(data, 'memory.events.jsonl')
  };
}

function readSettings(file) {
  const out = defaults();
  const explicit = file !== undefined && file !== null;
  const p = expand(explicit ? file : out.settings_path);
  out.settings_path = p;
  if (!fs.existsSync(p)) {
    if (explicit) throw new MemoryError('invalid_request', `settings file does not exist: ${p}`, 400);
    return out;
  }
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
    throw new MemoryError('invalid_request', `cannot read settings: ${e.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new MemoryError('invalid_request', 'settings must be an object');
  for (const k of Object.keys(out)) {
    if (k !== 'cli_path' && k !== 'skill_path' && parsed[k] !== undefined) out[k] = parsed[k];
  }
  return out;
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(expand(file)), { recursive: true });
}

function storageError(error) {
  if (error instanceof MemoryError) return error;
  const message = error?.message || String(error);
  if (/busy|locked/i.test(message)) return new MemoryError('storage_busy', 'memory database is busy', 409);
  return new MemoryError('storage_error', `memory database error: ${message}`, 500);
}

function openDb(file) {
  const p = expand(file);
  let db;
  try {
    ensureParent(p);
    db = new DatabaseSync(p);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA cache_size=-2048; PRAGMA temp_store=FILE; BEGIN IMMEDIATE;');
    db.exec(`
CREATE TABLE IF NOT EXISTS notes (
 thread TEXT NOT NULL, path TEXT NOT NULL, text TEXT NOT NULL,
 created REAL NOT NULL, updated REAL NOT NULL, revision INTEGER NOT NULL,
 PRIMARY KEY(thread,path));
CREATE TABLE IF NOT EXISTS windows (
 thread TEXT NOT NULL, window_id TEXT NOT NULL, previous_window_id TEXT,
 window_number INTEGER, source_file TEXT, source_offset INTEGER, item_count INTEGER NOT NULL DEFAULT 0,
 raw TEXT,
 PRIMARY KEY(thread,window_id));
CREATE TABLE IF NOT EXISTS items (
 visible_thread TEXT NOT NULL, origin_thread TEXT NOT NULL, canonical_id TEXT NOT NULL,
 original_id TEXT, window_id TEXT, ordinal INTEGER NOT NULL, source_file TEXT,
 source_offset INTEGER, raw TEXT NOT NULL, text TEXT NOT NULL, role TEXT, call_id TEXT,
 tool_namespace TEXT, tool_name TEXT, attachments TEXT, truncated INTEGER NOT NULL DEFAULT 0,
 source_ordinal INTEGER,
 PRIMARY KEY(visible_thread,canonical_id));
CREATE INDEX IF NOT EXISTS items_visible_window ON items(visible_thread,window_id,ordinal);
CREATE INDEX IF NOT EXISTS items_visible_role ON items(visible_thread,role);
CREATE TABLE IF NOT EXISTS import_sources (
 thread TEXT PRIMARY KEY, source_file TEXT, source_dev TEXT, source_ino TEXT, source_size INTEGER,
 source_mtime INTEGER, byte_offset INTEGER NOT NULL DEFAULT 0, ordinal INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL, source_boundary TEXT, history_base_thread TEXT, history_base_end INTEGER,
 history_base_end_ordinal INTEGER,
 last_window_id TEXT, error TEXT,
 base_items_ordinal INTEGER NOT NULL DEFAULT -1,
 base_windows_rowid INTEGER NOT NULL DEFAULT 0,
 base_copy_done INTEGER NOT NULL DEFAULT 0,
 base_check_offset INTEGER NOT NULL DEFAULT 0,
 base_check_ordinal INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS write_receipts (
 request_id TEXT PRIMARY KEY, thread TEXT NOT NULL, operation TEXT NOT NULL, args_json TEXT NOT NULL,
 result_json TEXT NOT NULL, created REAL NOT NULL);
`);
    try { db.exec('ALTER TABLE import_sources ADD COLUMN history_base_end_ordinal INTEGER'); }
    catch (error) { if (!/duplicate column name/i.test(error?.message || '')) throw error; }
    for (const column of [
      'base_items_ordinal INTEGER NOT NULL DEFAULT -1',
      'base_windows_rowid INTEGER NOT NULL DEFAULT 0',
      'base_copy_done INTEGER NOT NULL DEFAULT 0',
      'base_check_offset INTEGER NOT NULL DEFAULT 0',
      'base_check_ordinal INTEGER NOT NULL DEFAULT 0'
    ]) {
      try { db.exec(`ALTER TABLE import_sources ADD COLUMN ${column}`); }
      catch (error) { if (!/duplicate column name/i.test(error?.message || '')) throw error; }
    }
    db.exec('COMMIT');
    return db;
  } catch (error) {
    try { db?.exec('ROLLBACK'); } catch {}
    try { db?.close(); } catch {}
    throw storageError(error);
  }
}

function notePath(input, agent = DEFAULT_AGENT, prefix = false) {
  if (prefix && (input == null || input === '')) return `${agent}/notes/`;
  if (typeof input !== 'string' || !input) throw new MemoryError('invalid_request', 'path is required');
  let p = input.startsWith('/') ? input : `${agent}/notes/${input}`;
  const trailing = prefix && p.endsWith('/');
  const parts = p.replace(/^\/+/, '').split('/');
  if (trailing) parts.pop();
  if (!parts.length || parts.some((x) => !x || x === '.' || x === '..') || !parts.includes('notes')) {
    throw new MemoryError('invalid_request', 'invalid notes path');
  }
  const i = parts.indexOf('notes');
  if (i === parts.length - 1 && !prefix) throw new MemoryError('invalid_request', 'invalid notes path');
  return `/${parts.join('/')}${trailing ? '/' : ''}`;
}

function fitUtf8(text, max) {
  if (bytes(text) <= max) return String(text);
  let a = points(text), lo = 0, hi = a.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (bytes(a.slice(0, mid).join('')) <= max) lo = mid; else hi = mid - 1;
  }
  return a.slice(0, lo).join('');
}

function fitResult(out, operation, max) {
  if (!max || bytes(compact(out)) <= max) return out;
  if (operation === 'history.read_item') {
    const original = out.content || '';
    let lo = 0, hi = points(original).length;
    out.content = '';
    if (bytes(compact(out)) > max) throw new MemoryError('budget_exceeded', 'history metadata exceeds output budget', 413);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      out.content = points(original).slice(0, mid).join('');
      out.next_offset_chars = out.offset_chars + mid < out.n_chars ? out.offset_chars + mid : null;
      if (bytes(compact(out)) <= max) lo = mid; else hi = mid - 1;
    }
    out.content = points(original).slice(0, lo).join('');
    out.next_offset_chars = out.offset_chars + lo < out.n_chars ? out.offset_chars + lo : null;
    if (original && !lo) throw new MemoryError('budget_exceeded', 'no history character fits output budget', 413);
    return out;
  }
  if (operation === 'notes.read_file') {
    const originalText = out.text;
    const lines = splitLines(out.text);
    out.truncated = true;
    while (lines.length && bytes(compact(out)) > max) { lines.pop(); out.text = lines.join(''); out.stop_line = out.start_line + lines.length - 1; }
    if (originalText && !lines.length) throw new MemoryError('budget_exceeded', 'no complete note line fits output budget', 413);
    if (bytes(compact(out)) > max) throw new MemoryError('budget_exceeded', 'no complete note line fits output budget', 413);
    return out;
  }
  else {
    for (const key of ['windows', 'items', 'files', 'matches']) {
      if (Array.isArray(out[key])) {
        out.has_more = true;
        while (out[key].length && bytes(compact(out)) > max) out[key].pop();
        break;
      }
    }
  }
  if (bytes(compact(out)) > max) throw new MemoryError('budget_exceeded', 'response metadata exceeds output budget', 413);
  return out;
}

function canonicalReceiptArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  return Object.fromEntries(Object.keys(args).sort().map((key) => [key, args[key]]));
}

function sourceCandidates(codexHome, thread) {
  const roots = [path.join(expand(codexHome), 'sessions'), path.join(expand(codexHome), 'archived_sessions')];
  let selected = null;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    let handle;
    try { handle = fs.opendirSync(dir); } catch { return; }
    try {
      let e;
      while ((e = handle.readSync())) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && e.name.endsWith('.jsonl') && e.name.includes(thread) && (!selected || p < selected)) selected = p;
      }
    } finally { try { handle.closeSync(); } catch {} }
  };
  roots.forEach(walk);
  return selected;
}

function normalizeHistoryItem(item, priorTool) {
  const kind = item?.type;
  const images = [];
  let opaque = false;
  const extract = (value) => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(extract).filter(Boolean).join('\n');
    if (!value || typeof value !== 'object') return '';
    if (value.encrypted_content || value.encrypted_output) opaque = true;
    let url = value.image_url;
    if (url && typeof url === 'object') url = url.url;
    if (typeof url === 'string' && url.startsWith('data:image/') && url.includes(';base64,')) {
      const [head, data] = url.split(';base64,');
      const image = { mime_type: head.slice(5), data, detail: [null, 'auto', 'low', 'high', 'original'].includes(value.detail) ? value.detail : null };
      if (!images.some((x) => compact(x) === compact(image))) images.push(image);
      return '[Image attachment]';
    }
    for (const key of ['text', 'content', 'summary']) if (Object.hasOwn(value, key)) return extract(value[key]);
    return '';
  };
  let role = item?.role;
  if (kind === 'agent_message') role = item.author === 'assistant' ? 'assistant' : 'tool';
  else if (kind?.includes('call') || kind === 'output' || kind === 'tool_search_output') role = 'tool';
  else if (!['user', 'assistant', 'tool', 'system', 'developer'].includes(role)) role = 'assistant';
  let text = '';
  if (kind?.endsWith('call_output') || kind === 'output') text = extract(item.output ?? '');
  else if (kind === 'image_generation_call') {
    text = item.revised_prompt || '[Generated image]';
    const result = item.result;
    if (typeof result === 'string' && result.startsWith('data:image/')) text = extract({ image_url: result });
    else if (typeof result === 'string' && result) images.push({ mime_type: result.startsWith('/9j/') ? 'image/jpeg' : result.startsWith('UklGR') ? 'image/webp' : 'image/png', data: result, detail: null });
  }
  else if (['function_call', 'custom_tool_call', 'local_shell_call', 'tool_search_call', 'web_search_call'].includes(kind)) {
    const value = item.arguments ?? item.input ?? item.action ?? '';
    text = typeof value === 'string' ? value : compact(value);
  } else if (kind === 'tool_search_output') text = compact(item.tools ?? []);
  else if (kind === 'reasoning') text = `${extract(item.summary ?? [])}\n${extract(item.content ?? [])}`.trim();
  else text = extract(item.content ?? item.text ?? '');
  if (kind === 'function_call_output' && text.startsWith('<codex_delegation>')) role = 'user';
  if (item.encrypted_function_args) text = '[Encrypted tool arguments unavailable locally]';
  else if (!text && (opaque || item.encrypted_content || item.encrypted_output)) text = '[Encrypted content unavailable locally]';
  let namespace = item.namespace, name = item.name;
  if (role === 'tool' && priorTool && (!namespace || !name)) { namespace ||= priorTool.namespace; name ||= priorTool.name; }
  return { role, text, attachments: images, namespace: namespace ?? null, name: name ?? null };
}

class MemoryBackend {
  constructor(settings) {
    this.settings = settings;
    this.db = openDb(settings.db_path);
  }

  close() { try { this.db.close(); } catch {} }

  log(event) {
    if (!this.settings.log_path) return;
    try { ensureParent(this.settings.log_path); fs.appendFileSync(expand(this.settings.log_path), `${compact({ timestamp: now(), ...event })}\n`); } catch {}
  }

  receipt(thread, operation, requestId, args, fn, max) {
    const argsJson = compact(canonicalReceiptArgs(args ?? {}));
    const row = this.db.prepare('SELECT thread,operation,args_json,result_json FROM write_receipts WHERE request_id=?').get(requestId);
    if (row) {
      if (row.thread !== thread || row.operation !== operation || row.args_json !== argsJson) throw new MemoryError('request_conflict', 'request_id was already used with different content', 409);
      return fitResult(JSON.parse(row.result_json), operation, max);
    }
    const savepoint = savepointName('receipt');
    this.db.exec(`SAVEPOINT ${savepoint}`);
    try {
      const result = fitResult(fn(), operation, max);
      this.db.prepare('INSERT INTO write_receipts VALUES(?,?,?,?,?,?)').run(requestId, thread, operation, argsJson, compact(result), now());
      this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (e) {
      try { this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch {}
      try { this.db.exec(`RELEASE SAVEPOINT ${savepoint}`); } catch {}
      throw e;
    }
  }

  normalizeThread(thread) {
    if (!validId(thread)) throw new MemoryError('invalid_request', 'thread_id must be a UUID');
    return thread;
  }

  write(thread, args, append, requestId, max) {
    const p = notePath(args?.path);
    if (typeof args?.text !== 'string') throw new MemoryError('invalid_request', 'text must be a UTF-8 string');
    let historyError = null;
    const isCheckpoint = p === '/root/notes/checkpoint.md';
    const priorReceipt = this.db.prepare('SELECT request_id FROM write_receipts WHERE request_id=?').get(requestId);
    if (isCheckpoint && !priorReceipt) {
      try { this.importHistory(thread); }
      catch (e) {
        if (e instanceof MemoryError && String(e.code).startsWith('source_')) historyError = { code: e.code, message: e.message };
        else throw e;
      }
    }
    const result = this.receipt(thread, append ? 'notes.append_to_file' : 'notes.write_file', requestId, args, () => {
      const old = this.db.prepare('SELECT text,revision,created FROM notes WHERE thread=? AND path=?').get(thread, p);
      const text = append && old ? old.text + args.text : args.text;
      if (bytes(text) > MAX_NOTE_BYTES) throw new MemoryError('note_too_large', 'note exceeds 1000000 UTF-8 bytes', 413);
      const rev = old ? Number(old.revision) + 1 : 1;
      const t = now();
      this.db.prepare(`INSERT INTO notes(thread,path,text,created,updated,revision) VALUES(?,?,?,?,?,?)
        ON CONFLICT(thread,path) DO UPDATE SET text=excluded.text,updated=excluded.updated,revision=excluded.revision`).run(thread, p, text, old ? old.created : t, t, rev);
      const out = { ok: true, path: p, byte_size: bytes(text), revision: rev };
      if (isCheckpoint) {
        out.source = this.sourceState(thread);
        if (historyError) out.history_error = historyError;
      }
      return out;
    }, max);
    return result;
  }

  readFile(thread, args, max) {
    const p = notePath(args?.path);
    const size = this.db.prepare('SELECT octet_length(text) AS byte_size FROM notes WHERE thread=? AND path=?').get(thread, p);
    if (!size) throw new MemoryError('not_found', 'note not found', 404);
    if (Number(size.byte_size) > MAX_NOTE_BYTES) throw new MemoryError('note_too_large', 'note exceeds 1000000 UTF-8 bytes', 413);
    const row = this.db.prepare('SELECT text,revision FROM notes WHERE thread=? AND path=?').get(thread, p);
    const lines = splitLines(row.text), n = lines.length;
    let s = args?.start_line === undefined ? 1 : args.start_line;
    let e = args?.stop_line === undefined ? n : args.stop_line;
    if (!Number.isInteger(s) || !Number.isInteger(e) || s === 0 || (e === 0 && Object.hasOwn(args || {}, 'stop_line'))) throw new MemoryError('invalid_request', 'line must be a nonzero integer');
    if (s < 0) s = n + s + 1;
    if (e < 0) e = n + e + 1;
    s = Math.max(1, Math.min(n + 1, s)); e = Math.max(0, Math.min(n, e));
    return fitResult({ path: p, text: s <= e ? lines.slice(s - 1, e).join('') : '', start_line: s, stop_line: e, total_lines: n, truncated: false, revision: row.revision }, 'notes.read_file', max);
  }

  listFiles(thread, args, max) {
    const prefix = notePath(args?.prefix, DEFAULT_AGENT, true);
    const lim = integer(args?.max_results, 'max_results', 100);
    const by = args?.file_order_by ?? 'name', dir = args?.file_order ?? 'ascending';
    if (!['name', 'created_at', 'updated_at'].includes(by) || !['ascending', 'descending'].includes(dir)) throw new MemoryError('invalid_request', 'invalid file ordering');
    const col = { name: 'path', created_at: 'created', updated_at: 'updated' }[by];
    const rows = []; let more = false, stmt = this.db.prepare(`SELECT path,octet_length(text) AS byte_size,created,updated FROM notes WHERE thread=? AND substr(path,1,length(?))=? ORDER BY ${col} ${dir === 'descending' ? 'DESC' : 'ASC'},path LIMIT ?`);
    for (const r of stmt.iterate(thread, prefix, prefix, lim + 1)) { if (rows.length >= lim) { more = true; break; } const candidate = { path:r.path, byte_size:Number(r.byte_size), created_at:iso(r.created), updated_at:iso(r.updated) }; if (bytes(compact({ files:[...rows,candidate], has_more:false })) > max) { if (!rows.length) throw new MemoryError('budget_exceeded', 'file metadata exceeds output budget', 413); more = true; break; } rows.push(candidate); }
    return fitResult({ files: rows, has_more: more }, 'notes.list_files_by_prefix', max);
  }

  searchNotes(thread, args, max) {
    if (typeof args?.query !== 'string' || !args.query) throw new MemoryError('invalid_request', 'query is required');
    const mf = integer(args.max_files, 'max_files', 100), mm = integer(args.max_matches_per_file, 'max_matches_per_file', 20);
    const recent = bool(args.recent_file_first, 'recent_file_first', true), prefix = notePath(args.path_prefix, DEFAULT_AGENT, true);
    const files = []; let stopped = false;
    const stmt = this.db.prepare(`SELECT path,octet_length(text) AS byte_size FROM notes WHERE thread=? AND substr(path,1,length(?))=? ORDER BY created ${recent ? 'DESC' : 'ASC'},path`);
    for (const m of stmt.iterate(thread, prefix, prefix)) {
      if (Number(m.byte_size) > MAX_NOTE_BYTES) throw new MemoryError('note_too_large', 'note exceeds 1000000 UTF-8 bytes', 413);
      const r = this.db.prepare('SELECT text FROM notes WHERE thread=? AND path=?').get(thread, m.path); if (!r) continue;
      const matches = []; let lineNo = 0, extra = false;
      for (const t of splitLines(r.text)) { lineNo += 1; const clean = t.replace(/[\r\n\v\f\x1c-\x1e\x85\u2028\u2029]+$/u, ''); if (clean.includes(args.query)) { if (matches.length < mm) matches.push({ line_number:lineNo, text:clean }); else { extra = true; break; } } }
      if (matches.length) { if (files.length >= mf) { stopped = true; break; } const candidate = { path:m.path, matches, has_more_matches:extra }; if (bytes(compact({ files:[...files,candidate], has_more:false })) > max) { if (!files.length) throw new MemoryError('budget_exceeded', 'note search result exceeds output budget', 413); stopped = true; break; } files.push(candidate); }
    }
    return fitResult({ files, has_more: stopped }, 'notes.search_contents', max);
  }

  importHistory(thread, stack = new Set(), bound = null, budget = null, depth = 0) {
    if (stack.has(thread)) throw new MemoryError('source_incompatible', 'history_base cycle detected', 409);
    if (depth >= MAX_IMPORT_DEPTH) throw new MemoryError('source_limit', 'history_base recursion depth exceeded', 409);
    const quota = budget || { records: 0, bytes: 0 };
    stack.add(thread);
    let file = null, st = null, existing = null;
    const state = () => this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread);
    const saveError = (error) => {
      const row = state();
      if (!row) throw error;
      const savepoint = savepointName('import_error');
      this.db.exec(`SAVEPOINT ${savepoint}`);
      try {
        this.db.prepare('UPDATE import_sources SET status=?,error=? WHERE thread=?').run(error.code, error.message, thread);
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (e) {
        try { this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch {}
        try { this.db.exec(`RELEASE SAVEPOINT ${savepoint}`); } catch {}
        throw e;
      }
      return row;
    };
    const consume = (n, record = false) => {
      quota.bytes += n;
      if (record) quota.records += 1;
    };
    const canStart = () => quota.records < IMPORT_CHUNK_RECORDS && quota.bytes < IMPORT_CHUNK_BYTES;
    const readLine = (fd, start, limit) => {
      let pos = start, chunks = [], total = 0;
      while (pos < limit) {
        const want = Math.min(IMPORT_READ_BYTES, limit - pos);
        const buf = Buffer.alloc(want);
        const n = fs.readSync(fd, buf, 0, want, pos);
        if (!n) break;
        const part = buf.subarray(0, n), nl = part.indexOf(0x0a);
        if (nl >= 0) {
          const lineBytes = total + nl;
          if (lineBytes > MAX_IMPORT_LINE_BYTES) return { oversized: true, offset: start };
          chunks.push(part.subarray(0, nl));
          return { offset: start, next: start + lineBytes + 1, raw: Buffer.concat(chunks).toString('utf8'), bytes: lineBytes + 1, complete: true };
        }
        total += n;
        if (total > MAX_IMPORT_LINE_BYTES) return { oversized: true, offset: start };
        chunks.push(part);
        pos += n;
      }
      return { offset: start, next: start, raw: Buffer.concat(chunks).toString('utf8'), bytes: total, complete: false };
    };
    const parseRecord = (line, ordinal, currentWindow, visibleOrdinal) => {
      let obj;
      try { obj = JSON.parse(line.raw); } catch { throw new MemoryError('source_incompatible', `invalid JSONL at byte ${line.offset}`, 409, { source_file: file, offset: line.offset }); }
      const sourceOrdinal = obj && Object.hasOwn(obj, 'ordinal') ? obj.ordinal : null;
      if (sourceOrdinal !== null && (!Number.isInteger(sourceOrdinal) || sourceOrdinal < 0 || sourceOrdinal !== ordinal)) throw new MemoryError('source_incompatible', 'record ordinal does not match completed JSONL line ordinal', 409, { source_file: file, offset: line.offset, expected: ordinal, actual: sourceOrdinal });
      const typ = obj?.type;
      if (!['session_meta', 'response_item', 'event_msg', 'turn_context', 'compacted', 'world_state', 'token_usage_record', 'inter_agent_communication_metadata'].includes(typ)) throw new MemoryError('source_incompatible', `unsupported rollout record type: ${typ}`, 409, { source_file: file, offset: line.offset });
      if (typ === 'session_meta') {
        if (!obj.payload || obj.payload.id !== thread || !SUPPORTED_ROLLOUT_VERSIONS.includes(obj.payload.cli_version)) throw new MemoryError('source_incompatible', 'session_meta identity/version changed', 409);
      } else if (typ === 'compacted') {
        const p = obj.payload;
        if (!p || typeof p.window_id !== 'string' || typeof p.previous_window_id !== 'string') throw new MemoryError('source_incompatible', 'compacted requires window_id and previous_window_id', 409);
        currentWindow = p.window_id;
        this.db.prepare(`INSERT OR IGNORE INTO windows(thread,window_id,previous_window_id,window_number,source_file,source_offset,item_count,raw) VALUES(?,?,?,?,?,?,0,?)`).run(thread, p.window_id, p.previous_window_id, p.window_number ?? null, file, line.offset, compact(p));
        this.db.prepare('UPDATE windows SET previous_window_id=?,window_number=?,raw=? WHERE thread=? AND window_id=?').run(p.previous_window_id, p.window_number ?? null, compact(p), thread, p.window_id);
      } else if (typ === 'response_item') {
        if (!obj.payload || typeof obj.payload !== 'object' || typeof obj.payload.type !== 'string') throw new MemoryError('source_incompatible', 'response_item payload is unsupported', 409);
        const item = obj.payload, call = item.call_id;
        const prior = call ? this.db.prepare("SELECT tool_namespace AS namespace,tool_name AS name FROM items WHERE visible_thread=? AND call_id=? AND tool_name IS NOT NULL ORDER BY ordinal LIMIT 1").get(thread, call) : null;
        const norm = normalizeHistoryItem(item, prior);
        const canonical = sourceOrdinal === null ? `${thread}:byte:${line.offset}` : `${thread}:ordinal:${sourceOrdinal}`;
        if (!this.db.prepare('SELECT 1 FROM items WHERE visible_thread=? AND canonical_id=?').get(thread, canonical)) {
          this.db.prepare(`INSERT INTO items(visible_thread,origin_thread,canonical_id,original_id,window_id,ordinal,source_file,source_offset,raw,text,role,call_id,tool_namespace,tool_name,attachments,truncated,source_ordinal) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(thread, thread, canonical, item.id ?? null, currentWindow, visibleOrdinal.value++, file, line.offset, compact(item), norm.text, norm.role, call ?? null, norm.namespace, norm.name, compact(norm.attachments), Number(item.truncated || item.output_omitted_bytes > 0) ? 1 : 0, sourceOrdinal);
          this.db.prepare('UPDATE windows SET item_count=item_count+1 WHERE thread=? AND window_id=?').run(thread, currentWindow);
        }
      }
      return currentWindow;
    };
    try {
      existing = state();
      file = existing?.source_file || sourceCandidates(this.settings.codex_home, thread);
      if (!file || !fs.existsSync(file)) {
        if (existing) throw new MemoryError('source_not_ready', 'registered rollout source is missing', 409, { source_file: existing.source_file });
        throw new MemoryError('source_not_ready', 'rollout source not found', 409);
      }
      if (existing?.source_file && existing.source_file !== file) throw new MemoryError('source_incompatible', 'rollout source changed', 409, { source_file: existing.source_file });
      st = fs.statSync(file);
      if (existing && Number(st.size) < Number(existing.byte_offset)) throw new MemoryError('source_incompatible', 'rollout source shrank', 409, { source_file: file });
      if (existing && existing.source_dev != null && (String(st.dev) !== String(existing.source_dev) || String(st.ino) !== String(existing.source_ino))) throw new MemoryError('source_incompatible', 'rollout source identity changed', 409, { source_file: file });
      const fence = bound ? { endByte: bound.endByte, endOrdinal: bound.endOrdinal } : null;
      if (fence && (!Number.isInteger(fence.endByte) || !Number.isInteger(fence.endOrdinal) || fence.endByte <= 0 || fence.endOrdinal < 1)) throw new MemoryError('source_incompatible', 'history_base boundary is invalid', 409);
      if (fence && fence.endByte > Number(st.size)) throw new MemoryError('source_not_ready', 'rollout source has not reached history_base boundary', 409, { source_file: file, end_byte_offset: fence.endByte });
      const fd = fs.openSync(file, 'r');
      let first;
      try { first = readLine(fd, 0, Number(st.size)); } finally { fs.closeSync(fd); }
      if (first.oversized) throw new MemoryError('source_limit', 'session_meta line exceeds 16 MiB', 409, { source_file: file });
      if (!first.complete || !first.raw) throw new MemoryError('source_not_ready', 'session_meta line is incomplete', 409, { source_file: file });
      let firstObj;
      try { firstObj = JSON.parse(first.raw); } catch { throw new MemoryError('source_incompatible', 'session_meta is invalid JSON', 409, { source_file: file }); }
      if (firstObj.type !== 'session_meta' || !firstObj.payload || typeof firstObj.payload !== 'object') throw new MemoryError('source_incompatible', 'rollout does not begin with session_meta', 409, { source_file: file });
      if (Object.hasOwn(firstObj, 'ordinal') && firstObj.ordinal !== 0) throw new MemoryError('source_incompatible', 'session_meta ordinal must be zero', 409);
      let meta = firstObj.payload;
      if (meta.id !== thread) throw new MemoryError('source_incompatible', 'session_meta.id does not match thread_id', 409, { source_file: file });
      if (!SUPPORTED_ROLLOUT_VERSIONS.includes(meta.cli_version)) throw new MemoryError('source_incompatible', 'unsupported Codex cli_version', 409, { cli_version: meta.cli_version });
      const initialWindow = meta.context_window?.window_id;
      const initialWindowNumber = meta.context_window?.window_number ?? 0;
      const firstEnd = first.next;
      if (typeof initialWindow !== 'string' || !initialWindow) throw new MemoryError('source_incompatible', 'session_meta.context_window.window_id is required', 409);
      if (fence && fence.endByte < firstEnd) throw new MemoryError('source_incompatible', 'history_base boundary precedes session_meta', 409);
      if (fence) { const ffd = fs.openSync(file, 'r'); const b = Buffer.alloc(1); try { fs.readSync(ffd, b, 0, 1, fence.endByte - 1); } finally { fs.closeSync(ffd); } if (b[0] !== 0x0a) throw new MemoryError('source_incompatible', 'history_base byte fence is not a complete JSONL line', 409); }
      let historyBase = null, historyEnd = null, historyEndOrdinal = null;
      if (meta.history_base !== undefined) {
        const hb = meta.history_base;
        if (!hb || typeof hb !== 'object' || typeof hb.thread_id !== 'string' || !Number.isInteger(hb.end_byte_offset) || !Number.isInteger(hb.end_ordinal_exclusive)) throw new MemoryError('source_incompatible', 'history_base requires explicit thread and byte/ordinal fence', 409);
        historyBase = hb.thread_id; historyEnd = hb.end_byte_offset; historyEndOrdinal = hb.end_ordinal_exclusive;
      }
      if (existing?.history_base_thread && (existing.history_base_thread !== historyBase || Number(existing.history_base_end) !== Number(historyEnd) || Number(existing.history_base_end_ordinal) !== Number(historyEndOrdinal))) throw new MemoryError('source_incompatible', 'history_base changed', 409);
      const savepoint = savepointName('import_history');
      this.db.exec(`SAVEPOINT ${savepoint}`);
      try {
        const cur = existing && existing.source_file === file ? Number(existing.byte_offset) : 0;
        const ord = existing && existing.source_file === file ? Number(existing.ordinal) : 0;
        const old = existing && existing.source_file === file ? existing : null;
        this.db.prepare(`INSERT OR IGNORE INTO import_sources(thread,source_file,source_dev,source_ino,source_size,source_mtime,byte_offset,ordinal,status,source_boundary,history_base_thread,history_base_end,history_base_end_ordinal,last_window_id,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(thread, file, String(st.dev), String(st.ino), st.size, Math.trunc(st.mtimeMs), cur, ord, 'catching_up', JSON.stringify({ window_id: old?.last_window_id || initialWindow }), historyBase, historyEnd, historyEndOrdinal, old?.last_window_id || initialWindow, null);
        this.db.prepare(`UPDATE import_sources SET source_dev=?,source_ino=?,source_size=?,source_mtime=?,history_base_thread=?,history_base_end=?,history_base_end_ordinal=?,error=NULL WHERE thread=?`).run(String(st.dev), String(st.ino), st.size, Math.trunc(st.mtimeMs), historyBase, historyEnd, historyEndOrdinal, thread);
        this.db.prepare(`INSERT OR IGNORE INTO windows(thread,window_id,window_number,source_file,source_offset,item_count) VALUES(?,?,?,?,?,0)`).run(thread, initialWindow, initialWindowNumber, file, firstEnd - 1);
        const headerNew = !old || Number(old.byte_offset || 0) < firstEnd;
        let current = old?.last_window_id || initialWindow;
        let child = this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread);
        first.raw = null; firstObj = null; meta = null;
        const inheritedDone = !!child.base_copy_done || !!(old?.history_base_thread && Number(old.byte_offset || 0) > 0);
        if (historyBase && historyBase !== thread && !inheritedDone) {
          const parentState = this.importHistory(historyBase, stack, { endByte: historyEnd, endOrdinal: historyEndOrdinal }, quota, depth + 1);
          const parentSource = this.db.prepare('SELECT source_file FROM import_sources WHERE thread=?').get(historyBase)?.source_file;
          let checkOffset = Number(child.base_check_offset || 0), checkOrdinal = Number(child.base_check_ordinal || 0);
          if (!(old?.history_base_thread && Number(old.byte_offset || 0) > 0) && !child.base_copy_done) {
            const pfd = parentSource ? fs.openSync(parentSource, 'r') : null;
            try {
              while (pfd && checkOffset < historyEnd && canStart()) {
                const want = Math.min(IMPORT_READ_BYTES, historyEnd - checkOffset, Math.max(1, IMPORT_CHUNK_BYTES - quota.bytes));
                const buf = Buffer.alloc(want), n = fs.readSync(pfd, buf, 0, want, checkOffset);
                if (!n) break;
                for (let i = 0; i < n; i += 1) if (buf[i] === 0x0a) checkOrdinal += 1;
                checkOffset += n; consume(n, false);
              }
            } finally { try { if (pfd != null) fs.closeSync(pfd); } catch {} }
            this.db.prepare('UPDATE import_sources SET base_check_offset=?,base_check_ordinal=? WHERE thread=?').run(checkOffset, checkOrdinal, thread);
            child = this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread);
            if (checkOffset >= historyEnd && checkOrdinal !== historyEndOrdinal) throw new MemoryError('source_incompatible', 'history_base ordinal fence does not match complete records', 409, { expected: historyEndOrdinal, actual: checkOrdinal });
          }
          const fenceChecked = checkOffset === historyEnd && checkOrdinal === historyEndOrdinal;
          const parentReady = Number(parentState.byte_offset || 0) >= historyEnd && Number(parentState.ordinal || 0) >= historyEndOrdinal && fenceChecked;
          if (!parentReady) {
            this.db.prepare('UPDATE import_sources SET status=? WHERE thread=?').run(parentState.status === 'partial' ? 'partial' : 'catching_up', thread);
            this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
            return this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread);
          }
          while (!child.base_copy_done && canStart()) {
            const row = this.db.prepare(`SELECT ordinal,octet_length(raw) AS n FROM items WHERE visible_thread=? AND ordinal>? AND ((origin_thread=? AND source_file=? AND source_offset<?) OR origin_thread<>?) ORDER BY ordinal LIMIT 1`).get(historyBase, Number(child.base_items_ordinal ?? -1), historyBase, parentSource, historyEnd, historyBase);
            if (!row) break;
            if (Number(row.n || 0) > MAX_IMPORT_LINE_BYTES) throw new MemoryError('source_limit', 'inherited item exceeds 16 MiB', 409);
            const nextOrd = Number(this.db.prepare('SELECT coalesce(max(ordinal),-1)+1 n FROM items WHERE visible_thread=?').get(thread).n);
            this.db.prepare(`INSERT OR IGNORE INTO items(visible_thread,origin_thread,canonical_id,original_id,window_id,ordinal,source_file,source_offset,raw,text,role,call_id,tool_namespace,tool_name,attachments,truncated,source_ordinal)
              SELECT ?,origin_thread,canonical_id,original_id,window_id,?,source_file,source_offset,raw,text,role,call_id,tool_namespace,tool_name,attachments,truncated,source_ordinal FROM items WHERE visible_thread=? AND ordinal=?`).run(thread, nextOrd, historyBase, row.ordinal);
            this.db.prepare('UPDATE import_sources SET base_items_ordinal=? WHERE thread=?').run(row.ordinal, thread); child.base_items_ordinal = row.ordinal; consume(Number(row.n || 0), true);
          }
          while (!child.base_copy_done && canStart()) {
            const row = this.db.prepare(`SELECT rowid,source_file,source_offset,octet_length(raw) AS n FROM windows WHERE thread=? AND rowid>? AND (source_file IS NULL OR source_file<>? OR source_offset IS NULL OR source_offset<?) ORDER BY rowid LIMIT 1`).get(historyBase, Number(child.base_windows_rowid ?? 0), parentSource, historyEnd);
            if (!row) { this.db.prepare('UPDATE import_sources SET base_copy_done=1 WHERE thread=?').run(thread); child.base_copy_done = 1; break; }
            const n = Number(row.n || 0);
            if (n > MAX_IMPORT_LINE_BYTES) throw new MemoryError('source_limit', 'inherited window exceeds 16 MiB', 409);
            this.db.prepare(`INSERT OR IGNORE INTO windows(thread,window_id,previous_window_id,window_number,source_file,source_offset,item_count,raw)
              SELECT ?,window_id,previous_window_id,window_number,source_file,source_offset,0,raw FROM windows WHERE thread=? AND rowid=?`).run(thread, historyBase, row.rowid);
            this.db.prepare('UPDATE import_sources SET base_windows_rowid=? WHERE thread=?').run(row.rowid, thread); child.base_windows_rowid = row.rowid; consume(n, true);
          }
          this.db.prepare('UPDATE windows SET item_count=(SELECT count(*) FROM items i WHERE i.visible_thread=? AND i.window_id=windows.window_id) WHERE thread=?').run(thread, thread);
          child = this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread);
          if (!child.base_copy_done) {
            const status = parentReady && quota.records >= IMPORT_CHUNK_RECORDS || quota.bytes >= IMPORT_CHUNK_BYTES ? 'catching_up' : (parentState.status === 'partial' ? 'partial' : 'catching_up');
            this.db.prepare('UPDATE import_sources SET status=? WHERE thread=?').run(status, thread);
            this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
            return this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread);
          }
        } else {
          this.db.prepare('UPDATE import_sources SET base_copy_done=1 WHERE thread=?').run(thread);
          child = this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread);
        }
        let offset = Number(child.byte_offset || 0), ordinal = Number(child.ordinal || 0), visibleOrdinal = { value: Number(this.db.prepare('SELECT coalesce(max(ordinal),-1)+1 n FROM items WHERE visible_thread=?').get(thread).n) };
        const end = fence ? fence.endByte : Number(st.size);
        if (headerNew && !canStart()) { this.db.prepare('UPDATE import_sources SET status=? WHERE thread=?').run('catching_up', thread); this.db.exec(`RELEASE SAVEPOINT ${savepoint}`); return this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread); }
        if (headerNew) consume(first.bytes, true);
        if (fence && offset > end) { this.db.exec(`RELEASE SAVEPOINT ${savepoint}`); return this.db.prepare('SELECT * FROM import_sources WHERE thread=?').get(thread); }
        if (fence && offset === end && ordinal !== fence.endOrdinal) throw new MemoryError('source_incompatible', 'history_base ordinal fence does not match completed records', 409);
        if (offset < firstEnd) { offset = firstEnd; ordinal = Math.max(ordinal, 1); }
        let physicalPartial = false;
        const ownFd = fs.openSync(file, 'r');
        try {
          while (offset < end && canStart()) {
            const line = readLine(ownFd, offset, end);
            if (line.oversized) throw new MemoryError('source_limit', `JSONL line exceeds 16 MiB at byte ${offset}`, 409, { source_file: file, offset });
            if (!line.complete) { physicalPartial = true; break; }
            current = parseRecord(line, ordinal, current, visibleOrdinal);
            offset = line.next; ordinal += 1; consume(line.bytes, true);
          }
        } finally { fs.closeSync(ownFd); }
        const after = fs.statSync(file);
        let status;
        if (fence && offset >= end) { if (ordinal !== fence.endOrdinal) throw new MemoryError('source_incompatible', 'history_base ordinal fence does not match completed records', 409); status = 'ready'; }
        else if (offset < end) status = physicalPartial ? 'partial' : ((quota.records >= IMPORT_CHUNK_RECORDS || quota.bytes >= IMPORT_CHUNK_BYTES) ? 'catching_up' : 'partial');
        else status = after.size > st.size ? 'catching_up' : 'ready';
        this.db.prepare(`UPDATE import_sources SET source_file=?,source_dev=?,source_ino=?,source_size=?,source_mtime=?,byte_offset=?,ordinal=?,status=?,source_boundary=?,last_window_id=?,error=NULL WHERE thread=?`).run(file, String(st.dev), String(st.ino), st.size, Math.trunc(st.mtimeMs), offset, ordinal, status, JSON.stringify({ window_id: current }), current, thread);
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (e) {
        try { this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch {}
        try { this.db.exec(`RELEASE SAVEPOINT ${savepoint}`); } catch {}
        throw e;
      }
      return state();
    } catch (e) {
      if (e instanceof MemoryError && String(e.code).startsWith('source_')) { saveError(e); throw e; }
      throw e;
    } finally { stack.delete(thread); }
  }

  ensureHistory(thread) {
    try {
      const state = this.importHistory(thread);
      if (!state || state.status === 'not_ready') throw new MemoryError('source_not_ready', 'rollout history is not available', 409, { source: this.sourceState(thread) });
      return state;
    } catch (e) {
      if (e instanceof MemoryError) throw e;
      if (['EACCES','ENOENT','ENOTDIR','EISDIR','EIO'].includes(e?.code)) throw new MemoryError('source_not_ready', e.message, 409);
      throw storageError(e);
    }
  }

  *textChunks(rowid) {
    const size = this.db.prepare('SELECT octet_length(text) AS n FROM items WHERE rowid=?').get(rowid);
    if (Number(size?.n || 0) > MAX_IMPORT_LINE_BYTES) throw new MemoryError('source_limit', 'history item exceeds 16 MiB', 409);
    const stmt = this.db.prepare('SELECT substr(CAST(text AS BLOB),?+1,65536) AS chunk FROM items WHERE rowid=?');
    const decoder = new StringDecoder('utf8'); let offset = 0;
    while (true) {
      const row = stmt.get(offset, rowid); const value = row?.chunk;
      const blob = Buffer.isBuffer(value) ? value : (value == null ? Buffer.alloc(0) : Buffer.from(value));
      if (!blob.length) break;
      const text = decoder.write(blob); offset += blob.length; if (text) yield text;
    }
    const tail = decoder.end(); if (tail) yield tail;
  }

  windows(thread, args, max) {
    this.ensureHistory(thread);
    const lim = integer(args?.limit, 'limit', 100), recent = bool(args?.recent_first, 'recent_first', true);
    const rows = []; let more = false, stmt = this.db.prepare(`SELECT window_id,previous_window_id,window_number,item_count FROM windows WHERE thread=? ORDER BY rowid ${recent ? 'DESC' : 'ASC'} LIMIT ?`);
    for (const r of stmt.iterate(thread, lim + 1)) { if (rows.length >= lim) { more = true; break; } if (bytes(compact({ windows:[...rows,r], has_more:false, source:this.sourceState(thread) })) > max) { if (!rows.length) throw new MemoryError('budget_exceeded', 'window metadata exceeds output budget', 413); more = true; break; } rows.push(r); }
    return fitResult({ windows: rows, has_more: more, source: this.sourceState(thread) }, 'history.list_windows', max);
  }

  items(thread, args, max) {
    this.ensureHistory(thread);
    const lim = integer(args?.limit, 'limit', 100), recent = bool(args?.recent_first, 'recent_first', true);
    const where = ['visible_thread=?'], vals = [thread];
    if (args?.window_id !== undefined) { where.push('window_id=?'); vals.push(args.window_id); }
    if (args?.role !== undefined) { where.push('role=?'); vals.push(args.role); }
    if (args?.tool_namespace !== undefined) { where.push('tool_namespace=?'); vals.push(args.tool_namespace); }
    if (args?.tool_name !== undefined) { where.push('tool_name=?'); vals.push(args.tool_name); }
    const pc = Math.min(integer(args?.max_chars_per_item, 'max_chars_per_item', 2000), 1_000_000), rows = []; let more = false;
    const stmt = this.db.prepare(`SELECT rowid,canonical_id,original_id,origin_thread,window_id,ordinal,source_ordinal,role,call_id,tool_namespace,tool_name,truncated FROM items WHERE ${where.join(' AND ')} ORDER BY ordinal ${recent ? 'DESC' : 'ASC'} LIMIT ?`);
    for (const r of stmt.iterate(...vals, lim + 1)) {
      if (rows.length >= lim) { more = true; break; }
      const parts = []; let chars = 0;
      for (const chunk of this.textChunks(r.rowid)) { const cp = Array.from(chunk); const take = cp.slice(0, Math.max(0, pc - chars)); parts.push(take.join('')); chars += take.length; if (chars >= pc) break; }
      const out = { canonical_id:r.canonical_id, original_id:r.original_id, origin_thread:r.origin_thread, window_id:r.window_id, ordinal:r.ordinal, source_ordinal:r.source_ordinal ?? null, role:r.role, call_id:r.call_id, tool_namespace:r.tool_namespace, tool_name:r.tool_name, text:parts.join(''), attachments:[], truncated:!!r.truncated };
      const ab = this.db.prepare('SELECT octet_length(attachments) AS n FROM items WHERE rowid=?').get(r.rowid);
      const remaining = Math.max(0, max - bytes(compact({ items:[...rows,out], has_more:false, source:this.sourceState(thread) })) + 2);
      if (Number(ab?.n || 0) > remaining) throw new MemoryError('budget_exceeded', 'history attachments exceed output budget', 413);
      const ar = this.db.prepare('SELECT attachments FROM items WHERE rowid=?').get(r.rowid); out.attachments = JSON.parse(ar?.attachments || '[]');
      rows.push(out);
      if (bytes(compact({ items: rows, has_more: false, source: this.sourceState(thread) })) > max) { rows.pop(); if (!rows.length) throw new MemoryError('budget_exceeded', 'history metadata exceeds output budget', 413); more = true; break; }
      if (rows.length >= lim + 1) break;
    }
    return fitResult({ items: rows, has_more: more, source: this.sourceState(thread) }, 'history.list_items', max);
  }

  item(thread, args, max) {
    this.ensureHistory(thread);
    if (typeof args?.item_id !== 'string') throw new MemoryError('invalid_request', 'item_id is required');
    const offset = args.offset_chars === undefined ? 0 : integer(args.offset_chars, 'offset_chars', 0, 0);
    const limit = Math.min(integer(args.limit_chars, 'limit_chars', 10000), 1_000_000, Math.max(1, max));
    const row = this.db.prepare('SELECT rowid,canonical_id,original_id,origin_thread,window_id,source_ordinal,role,call_id,tool_namespace,tool_name,truncated,source_file,source_offset FROM items WHERE visible_thread=? AND canonical_id=? AND (? IS NULL OR window_id=?)').get(thread, args.item_id, args.window_id ?? null, args.window_id ?? null);
    if (!row) throw new MemoryError('not_found', 'history item not found', 404);
    const ab = this.db.prepare('SELECT octet_length(attachments) AS n FROM items WHERE rowid=?').get(row.rowid);
    const contentParts = []; let seen = 0, kept = 0;
    for (const chunk of this.textChunks(row.rowid)) { const cp = Array.from(chunk); if (seen + cp.length > offset && kept < limit) { const start = Math.max(0, offset - seen), take = Math.min(cp.length - start, limit - kept); const part = cp.slice(start, start + take); contentParts.push(part.join('')); kept += part.length; } seen += cp.length; }
    const content = contentParts.join('');
    const metadata = { item_id:row.canonical_id, original_id:row.original_id, origin_thread_id:row.origin_thread, window_id:row.window_id, source_ordinal:row.source_ordinal ?? null, role:row.role, call_id:row.call_id, tool_namespace:row.tool_namespace, tool_name:row.tool_name, content:'', offset_chars:offset, n_chars:seen, next_offset_chars:null, attachments:[], truncated:!!row.truncated, source_file:row.source_file, source_offset:row.source_offset };
    const remaining = Math.max(0, max - bytes(compact(metadata)) + 2);
    if (Number(ab?.n || 0) > remaining) throw new MemoryError('budget_exceeded', 'history attachments exceed output budget', 413);
    const ar = this.db.prepare('SELECT attachments FROM items WHERE rowid=?').get(row.rowid);
    return fitResult({ item_id: row.canonical_id, original_id: row.original_id, origin_thread_id: row.origin_thread, window_id: row.window_id, source_ordinal: row.source_ordinal ?? null, role: row.role, call_id: row.call_id, tool_namespace: row.tool_namespace, tool_name: row.tool_name, content, offset_chars: offset, n_chars: seen, next_offset_chars: offset + kept < seen ? offset + kept : null, attachments: JSON.parse(ar?.attachments || '[]'), truncated: !!row.truncated, source_file: row.source_file, source_offset: row.source_offset }, 'history.read_item', max);
  }

  searchHistory(thread, args, max) {
    this.ensureHistory(thread);
    if (typeof args?.query !== 'string' || !args.query) throw new MemoryError('invalid_request', 'query is required');
    const lim = integer(args.limit, 'limit', 100), where = ['visible_thread=?'], vals = [thread];
    if (args.window_id !== undefined) { where.push('window_id=?'); vals.push(args.window_id); }
    if (args.role !== undefined) { where.push('role=?'); vals.push(args.role); }
    if (args.tool_namespace !== undefined) { where.push('tool_namespace=?'); vals.push(args.tool_namespace); }
    if (args.tool_name !== undefined) { where.push('tool_name=?'); vals.push(args.tool_name); }
    const matches = [], stmt = this.db.prepare(`SELECT rowid,canonical_id,window_id,role FROM items WHERE ${where.join(' AND ')} ORDER BY ordinal DESC`); let stopped = false;
    for (const r of stmt.iterate(...vals)) {
      let buffer = '', basePoints = 0, nextStart = 0;
      const process = (eof) => {
        const safeLastStart = buffer.length - args.query.length - (eof ? 0 : 120);
        while (nextStart <= safeLastStart) {
          const at = buffer.indexOf(args.query, nextStart);
          if (at < 0 || at > safeLastStart) { nextStart = Math.max(nextStart, safeLastStart + 1); break; }
          if (matches.length >= lim) { stopped = true; return; }
          const candidate = { item_id:r.canonical_id, window_id:r.window_id, role:r.role, snippet:fitUtf8(buffer.slice(Math.max(0, at - 120), at + args.query.length + 120), 400), offset_chars:basePoints + Array.from(buffer.slice(0, at)).length };
          if (bytes(compact({ matches:[...matches,candidate], has_more:false, source:this.sourceState(thread) })) > max) { if (!matches.length) throw new MemoryError('budget_exceeded', 'history search result exceeds output budget', 413); stopped = true; return; }
          matches.push(candidate); nextStart = at + args.query.length;
        }
        const cut = Math.max(0, Math.min(buffer.length, nextStart - 120));
        let safeCut = cut; if (safeCut > 0 && safeCut < buffer.length && /[\uD800-\uDBFF]/u.test(buffer[safeCut - 1]) && /[\uDC00-\uDFFF]/u.test(buffer[safeCut])) safeCut -= 1;
        basePoints += Array.from(buffer.slice(0, safeCut)).length; buffer = buffer.slice(safeCut); nextStart -= safeCut;
      };
      for (const chunk of this.textChunks(r.rowid)) { buffer += chunk; process(false); if (stopped) break; }
      if (stopped) break; process(true); if (stopped) break;
    }
    return fitResult({ matches, has_more: stopped, source: this.sourceState(thread) }, 'history.search_contents', max);
  }

  sourceState(thread) {
    const x = this.db.prepare('SELECT source_file,byte_offset,ordinal,status,source_boundary,last_window_id,error FROM import_sources WHERE thread=?').get(thread);
    if (!x) return { status: 'not_ready', error: 'rollout source not registered' };
    if (x.source_file && !fs.existsSync(x.source_file)) return { ...x, status: 'not_ready', error: 'registered rollout source is missing' };
    return x;
  }

  bootstrap(thread, max) {
    let historyError = null;
    try { this.ensureHistory(thread); } catch (e) {
      if (e instanceof MemoryError && String(e.code).startsWith('source_')) historyError = { code: e.code, message: e.message };
      else throw e;
    }
    const cp = this.db.prepare("SELECT path,revision,updated FROM notes WHERE thread=? AND path='/root/notes/checkpoint.md'").get(thread);
    const source = this.sourceState(thread);
    const refs = [];
    if (!historyError) { const stmt = this.db.prepare("SELECT rowid,canonical_id,window_id,octet_length(raw) AS raw_bytes FROM items WHERE visible_thread=? AND role='user' ORDER BY ordinal DESC"); for (const r of stmt.iterate(thread)) { if (Number(r.raw_bytes || 0) > MAX_IMPORT_LINE_BYTES) throw new MemoryError('source_limit', 'history item raw exceeds 16 MiB', 409); const ok = this.db.prepare("SELECT 1 FROM items WHERE rowid=? AND EXISTS (SELECT 1 FROM json_each(json_extract(raw,'$.internal_chat_message_metadata_passthrough.content_item_kinds')) WHERE json_each.value='user.text')").get(r.rowid); if (!ok) continue; let preview=''; for (const chunk of this.textChunks(r.rowid)) { preview += chunk; if (preview.length >= 400) break; } refs.push({ item_id:r.canonical_id, window_id:r.window_id, preview:fitUtf8(preview,400) }); if (refs.length>=5) break; } }
    const out = { thread_id: thread, settings_path: this.settings.settings_path, skill_path: this.settings.skill_path, node_path: this.settings.node_path, cli_path: this.settings.cli_path, checkpoint: cp ? { path: cp.path, revision: cp.revision, updated_at: iso(cp.updated) } : null, source, ...(historyError ? { history_error: historyError } : {}), user_refs: refs };
    return fitResult(out, 'context.bootstrap', max);
  }

  dispatch(thread, operation, args, requestId, max) {
    this.normalizeThread(thread);
    if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) throw new MemoryError('invalid_request', 'args must be an object');
    const a = args ?? {};
    const rid = typeof requestId === 'string' && requestId ? requestId : uuid();
    if (bytes(rid) > 256) throw new MemoryError('invalid_request', 'request_id is too large');
    let locked = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      locked = true;
      let out;
      if (operation === 'notes.write_file') out = this.write(thread, a, false, rid, max);
      else if (operation === 'notes.append_to_file') out = this.write(thread, a, true, rid, max);
      else if (operation === 'notes.read_file') out = this.readFile(thread, a, max);
      else if (operation === 'notes.list_files_by_prefix') out = this.listFiles(thread, a, max);
      else if (operation === 'notes.search_contents') out = this.searchNotes(thread, a, max);
      else if (operation === 'history.list_windows') out = this.windows(thread, a, max);
      else if (operation === 'history.list_items') out = this.items(thread, a, max);
      else if (operation === 'history.read_item') out = this.item(thread, a, max);
      else if (operation === 'history.search_contents') out = this.searchHistory(thread, a, max);
      else if (operation === 'context.bootstrap') out = this.bootstrap(thread, max);
      else throw new MemoryError('not_found', `unknown operation: ${operation}`, 404);
      const result = fitResult(out, operation, max);
      this.log({ event: 'attempt', request_id: rid, thread_id: thread, operation, status: 'ok' });
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      const err = storageError(error);
      if (locked) {
        this.log({ event: 'attempt', request_id: rid, thread_id: thread, operation, status: 'error', error: err.code });
        try { this.db.exec('ROLLBACK'); } catch {}
      }
      throw err;
    }
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const x = argv[i];
    if (x === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (x.startsWith('--')) { const [k, v] = x.slice(2).split('=', 2); out[k.replaceAll('-', '_')] = v === undefined ? argv[++i] : v; }
    else out._.push(x);
  }
  return out;
}

function readStdinJson(limit = MAX_STDIN_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      process.stdin.destroy();
      reject(error);
    };
    process.stdin.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        fail(new MemoryError('invalid_request', `stdin exceeds ${limit} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const s = Buffer.concat(chunks, total).toString('utf8').trim();
        resolve(s ? JSON.parse(s) : {});
      } catch (e) { reject(new MemoryError('invalid_request', `invalid JSON args: ${e.message}`)); }
    });
    process.stdin.on('error', (e) => {
      if (!settled) { settled = true; reject(storageError(e)); }
    });
  });
}

function outputBudget(settings, opts, requestId) {
  const raw = Number(opts.max_output_bytes === undefined ? settings.max_output_bytes : opts.max_output_bytes);
  if (!Number.isInteger(raw) || raw <= 0) throw new MemoryError('invalid_request', 'max_output_bytes must be a positive integer');
  const envelopeMax = Math.min(raw, MAX_OUTPUT_BYTES);
  const envelopeOverhead = bytes(compact({ version: 1, request_id: requestId, result: {} })) - 2 + 1;
  const resultBudget = envelopeMax - envelopeOverhead;
  if (resultBudget <= 0) throw new MemoryError('budget_exceeded', 'output envelope exceeds byte budget', 413);
  return resultBudget;
}

async function runCall(args) {
  const opts = parseArgs(args);
  const requestId = opts.request_id || uuid();
  const emitError = (e) => {
    const err = storageError(e);
    const responseId = bytes(requestId) <= 256 ? requestId : uuid();
    let payload = { version: 1, request_id: responseId, error: { code: err.code, message: fitUtf8(String(err.message), 2048), ...(err.details ? { details: err.details } : {}) } };
    if (bytes(compact(payload)) + 1 > MAX_OUTPUT_BYTES) delete payload.error.details;
    if (bytes(compact(payload)) + 1 > MAX_OUTPUT_BYTES) payload = { version:1, request_id:responseId, error:{ code:err.code, message:fitUtf8(String(err.message), 2048) } };
    if (bytes(compact(payload)) + 1 > MAX_OUTPUT_BYTES) payload = { version:1, request_id:responseId, error:{ code:'budget_exceeded', message:'error response exceeds byte budget' } };
    process.stdout.write(`${compact(payload)}\n`);
    process.exitCode = 1;
  };
  let backend = null;
  try {
    const operation = opts._[0];
    if (!operation) throw new MemoryError('invalid_request', 'operation is required');
    if (bytes(requestId) > 256) throw new MemoryError('invalid_request', 'request_id is too large');
    const settings = readSettings(opts.settings);
    const data = await readStdinJson();
    const thread = opts.thread_id || process.env.CODEX_THREAD_ID;
    if (!thread) throw new MemoryError('invalid_request', 'thread_id is required');
    const max = outputBudget(settings, opts, requestId);
    backend = new MemoryBackend(settings);
    const result = backend.dispatch(thread, operation, data, requestId, max);
    process.stdout.write(`${compact({ version: 1, request_id: requestId, result })}\n`);
  } catch (e) { emitError(e); }
  finally { backend?.close(); }
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts._[0] !== 'call') throw new MemoryError('invalid_request', 'mode must be call');
  return runCall(argv.slice(1));
}

if (require.main === module) main().catch((e) => { process.stderr.write(`error: ${e.message}\n`); process.exitCode = e.status && e.status >= 400 ? 1 : 1; });

module.exports = { MemoryBackend, MemoryError, readSettings, defaults, fitResult, notePath };
