#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const MAX_NOTE_BYTES = 1024 * 1024;
const MAX_STDIN_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_IMPORT_RECORDS = 256;
const MAX_LINE_BYTES = 16 * 1024 * 1024;
const MAX_HISTORY_DEPTH = 32;
const DEFAULT_READ_CHARS = 64 * 1024;

class MemoryError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function dataHome() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  }
  return path.join(os.homedir(), '.local', 'share');
}

function expandHome(value) {
  if (typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function defaults() {
  const root = path.join(dataHome(), 'ctx-mgr-local-native');
  const pluginRoot = __dirname;
  return {
    settings_path: path.join(root, 'settings.json'),
    db_path: path.join(root, 'memory.sqlite3'),
    codex_home: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    max_output_bytes: MAX_OUTPUT_BYTES,
    skill_path: path.join(pluginRoot, 'skills', 'local-context-memory', 'SKILL.md'),
    node_path: process.execPath,
    cli_path: __filename,
  };
}

function readSettings(explicitPath) {
  const base = defaults();
  const settingsPath = expandHome(explicitPath || base.settings_path);
  if (!fs.existsSync(settingsPath)) {
    if (explicitPath) throw new MemoryError('settings_invalid', `Settings file was not found: ${settingsPath}`);
    return { ...base, settings_path: settingsPath };
  }
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch (error) { throw new MemoryError('settings_invalid', `Cannot read settings: ${error.message}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MemoryError('settings_invalid', 'Settings must be a JSON object');
  }
  const merged = { ...base, ...parsed, settings_path: settingsPath, cli_path: base.cli_path, skill_path: base.skill_path };
  merged.db_path = expandHome(merged.db_path);
  merged.codex_home = expandHome(merged.codex_home);
  return merged;
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function createImportSources(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS import_sources(
    visible_thread TEXT NOT NULL,
    origin_thread TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_file TEXT,
    source_dev TEXT,
    source_ino TEXT,
    source_size INTEGER,
    source_mtime REAL,
    byte_offset INTEGER NOT NULL DEFAULT 0,
    ordinal INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    source_boundary INTEGER,
    history_base_thread TEXT,
    history_base_end INTEGER,
    history_base_end_ordinal INTEGER,
    last_window_id TEXT,
    error TEXT,
    base_items_ordinal INTEGER NOT NULL DEFAULT -1,
    base_windows_rowid INTEGER NOT NULL DEFAULT 0,
    base_copy_done INTEGER NOT NULL DEFAULT 0,
    base_check_offset INTEGER NOT NULL DEFAULT 0,
    base_check_ordinal INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(visible_thread, source_key)
  )`);
}

function openDb(file) {
  file = expandHome(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA cache_size=-2048; PRAGMA temp_store=FILE; BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes(thread TEXT NOT NULL,path TEXT NOT NULL,text TEXT NOT NULL,created REAL NOT NULL,updated REAL NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(thread,path));
      CREATE TABLE IF NOT EXISTS windows(thread TEXT NOT NULL,window_id TEXT NOT NULL,previous_window_id TEXT,window_number INTEGER,source_file TEXT,source_offset INTEGER,item_count INTEGER NOT NULL DEFAULT 0,raw TEXT,source_key TEXT,PRIMARY KEY(thread,window_id));
      CREATE TABLE IF NOT EXISTS items(visible_thread TEXT NOT NULL,origin_thread TEXT NOT NULL,canonical_id TEXT NOT NULL,original_id TEXT,window_id TEXT,ordinal INTEGER NOT NULL,source_file TEXT,source_offset INTEGER,raw TEXT NOT NULL,text TEXT NOT NULL,role TEXT,call_id TEXT,tool_namespace TEXT,tool_name TEXT,attachments TEXT,truncated INTEGER NOT NULL DEFAULT 0,source_ordinal INTEGER,source_key TEXT,provenance TEXT NOT NULL DEFAULT 'legacy_payload',unavailable_original INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(visible_thread,canonical_id));
      CREATE INDEX IF NOT EXISTS items_window ON items(visible_thread,window_id,ordinal);
      CREATE INDEX IF NOT EXISTS items_role ON items(visible_thread,role);
      CREATE TABLE IF NOT EXISTS write_receipts(request_id TEXT PRIMARY KEY,thread TEXT NOT NULL,operation TEXT NOT NULL,args_json TEXT NOT NULL,result_json TEXT NOT NULL,created REAL NOT NULL);
    `);
    const sourceTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_sources'").get();
    if (!sourceTable) {
      createImportSources(db);
    } else if (!hasColumn(db, 'import_sources', 'source_key') || !hasColumn(db, 'import_sources', 'visible_thread')) {
      db.exec('ALTER TABLE import_sources RENAME TO import_sources_legacy');
      createImportSources(db);
      db.exec(`INSERT INTO import_sources(
        visible_thread,origin_thread,source_key,source_file,source_dev,source_ino,source_size,source_mtime,byte_offset,ordinal,status,source_boundary,
        history_base_thread,history_base_end,history_base_end_ordinal,last_window_id,error,base_items_ordinal,base_windows_rowid,base_copy_done,base_check_offset,base_check_ordinal)
        SELECT thread,thread,'legacy:' || thread,source_file,CAST(source_dev AS TEXT),CAST(source_ino AS TEXT),source_size,source_mtime,byte_offset,ordinal,status,source_boundary,
        history_base_thread,history_base_end,history_base_end_ordinal,last_window_id,error,base_items_ordinal,base_windows_rowid,base_copy_done,base_check_offset,base_check_ordinal
        FROM import_sources_legacy`);
      db.exec('DROP TABLE import_sources_legacy');
    }
    if (!hasColumn(db, 'items', 'source_key')) db.exec('ALTER TABLE items ADD COLUMN source_key TEXT');
    if (!hasColumn(db, 'items', 'provenance')) db.exec("ALTER TABLE items ADD COLUMN provenance TEXT NOT NULL DEFAULT 'legacy_payload'");
    if (!hasColumn(db, 'items', 'unavailable_original')) db.exec('ALTER TABLE items ADD COLUMN unavailable_original INTEGER NOT NULL DEFAULT 0');
    if (!hasColumn(db, 'windows', 'source_key')) db.exec('ALTER TABLE windows ADD COLUMN source_key TEXT');
    db.exec(`UPDATE items
      SET source_key=coalesce(
        (SELECT source_key FROM import_sources s
          WHERE s.visible_thread=items.visible_thread
            AND (s.source_file=items.source_file OR (s.source_file IS NULL AND items.source_file IS NULL))
          LIMIT 1),
        'legacy:' || visible_thread),
        provenance='legacy_payload'
      WHERE source_key IS NULL`);
    db.exec(`UPDATE items SET unavailable_original=1
      WHERE unavailable_original=0 AND text='' AND
        (instr(raw,'encrypted_content')>0 OR instr(raw,'ciphertext')>0)`);
    db.exec(`UPDATE windows
      SET source_key=(SELECT source_key FROM import_sources s
        WHERE s.visible_thread=windows.thread
          AND (s.source_file=windows.source_file OR (s.source_file IS NULL AND windows.source_file IS NULL))
        LIMIT 1)
      WHERE source_key IS NULL`);
    db.exec('COMMIT');
    return db;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close();
    throw error;
  }
}

function notePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) throw new MemoryError('path_invalid', 'Note path must be absolute');
  const clean = path.posix.normalize(value);
  if (!clean.startsWith('/root/') && clean !== '/root') throw new MemoryError('path_invalid', 'Note path must be under /root');
  return clean;
}

function jsonBytes(value) { return Buffer.byteLength(JSON.stringify(value)); }

function charLength(value) { return Array.from(value).length; }
function sliceChars(value, start, stop) { return Array.from(value).slice(start, stop).join(''); }

function trimString(value, maxBytes) {
  const chars = Array.from(value); let low = 0; let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(chars.slice(0, mid).join('')) <= maxBytes) low = mid; else high = mid - 1;
  }
  return chars.slice(0, low).join('');
}

function fitResult(input, maxBytes) {
  const result = structuredClone(input);
  if (jsonBytes(result) <= maxBytes) return result;
  for (const key of ['items', 'windows', 'files', 'matches', 'user_refs']) {
    if (Array.isArray(result[key])) {
      while (result[key].length && jsonBytes(result) > maxBytes) result[key].pop();
      result.has_more = true;
      if (jsonBytes(result) <= maxBytes) return result;
    }
  }
  const holder = typeof result.content === 'string' ? result : (result.checkpoint && typeof result.checkpoint.text === 'string' ? result.checkpoint : null);
  const field = holder === result ? 'content' : 'text';
  if (holder) {
    const original = holder[field];
    const originalChars = charLength(original);
    holder[field] = trimString(original, Math.max(0, maxBytes - 2048));
    while (holder[field] && jsonBytes(result) > maxBytes) holder[field] = sliceChars(holder[field], 0, Math.floor(charLength(holder[field]) * 0.8));
    const returnedChars = charLength(holder[field]);
    holder.truncated = returnedChars < originalChars || Boolean(holder.truncated);
    holder.next_offset_chars = holder.truncated ? (holder.offset_chars || 0) + returnedChars : null;
    if (holder === result) holder.n_chars = returnedChars;
    if (jsonBytes(result) <= maxBytes) return result;
  }
  return { truncated: true, error: 'result_exceeds_output_limit' };
}

function canonicalReceiptArgs(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalReceiptArgs).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalReceiptArgs(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function walkJsonl(root, thread, output, seen) {
  if (!fs.existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let handle;
    try {
      handle = fs.opendirSync(dir);
      for (;;) {
        const entry = handle.readSync(); if (!entry) break;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(thread)) {
          let real = full;
          try { real = fs.realpathSync(full); } catch {}
          if (!seen.has(real)) { seen.add(real); output.push(full); }
        }
      }
    } catch { continue; }
    finally { try { handle?.closeSync(); } catch {} }
  }
}

function sourceCandidates(codexHome, thread) {
  const output = []; const seen = new Set();
  walkJsonl(path.join(codexHome, 'sessions'), thread, output, seen);
  walkJsonl(path.join(codexHome, 'archived_sessions'), thread, output, seen);
  const keys = new Map();
  const orderKey = (file) => {
    if (keys.has(file)) return keys.get(file);
    let key;
    try {
      const header = JSON.parse(firstLine(file));
      key = String(header.timestamp || header.payload?.timestamp || header.payload?.created_at || file);
    } catch { key = file; }
    keys.set(file, key);
    return key;
  };
  return output.sort((left, right) => orderKey(left).localeCompare(orderKey(right)) || left.localeCompare(right));
}

function firstLine(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const size = Math.min(stat.size, MAX_LINE_BYTES + 1);
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, 0);
    let end = buffer.indexOf(10);
    if (end < 0) end = size;
    if (end > MAX_LINE_BYTES) throw new MemoryError('source_line_too_large', `History line exceeds ${MAX_LINE_BYTES} bytes`, { source_file: file });
    return buffer.subarray(0, end).toString('utf8').replace(/\r$/, '');
  } finally { fs.closeSync(fd); }
}

function parseJson(line, file, offset) {
  try { return JSON.parse(line); }
  catch (error) { throw new MemoryError('source_invalid_json', `Invalid history JSON: ${error.message}`, { source_file: file, source_offset: offset }); }
}

function stringsFrom(value, out = [], depth = 0) {
  if (depth > 8 || value == null) return out;
  if (typeof value === 'string') { if (value) out.push(value); return out; }
  if (Array.isArray(value)) { for (const item of value) stringsFrom(item, out, depth + 1); return out; }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (['text', 'content', 'summary', 'message', 'output', 'input'].includes(key)) stringsFrom(item, out, depth + 1);
    }
  }
  return out;
}

function normalizeHistoryItem(record, priorTool) {
  const payload = record && typeof record.payload === 'object' && record.payload !== null ? record.payload : {};
  const item = record.type === 'response_item' && payload && typeof payload === 'object' ? payload : record;
  const role = item.role || payload.role || (record.type === 'event_msg' ? 'service' : null);
  const text = stringsFrom(item).join('\n');
  const unavailableOriginal = !text && (() => {
    const stack = [record];
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== 'object') continue;
      for (const [key, child] of Object.entries(value)) {
        if (['encrypted_content', 'ciphertext'].includes(key) && typeof child === 'string' && child) return true;
        if (child && typeof child === 'object') stack.push(child);
      }
    }
    return false;
  })();
  const attachments = [];
  const visit = (value, depth = 0) => {
    if (depth > 8 || value == null) return;
    if (Array.isArray(value)) return value.forEach((x) => visit(x, depth + 1));
    if (typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'image_url' || key === 'file_url') && typeof child === 'string') attachments.push({ kind: key, value: child });
      else visit(child, depth + 1);
    }
  };
  visit(item);
  const toolName = item.name || payload.name || priorTool?.tool_name || null;
  const callId = item.call_id || payload.call_id || null;
  const namespace = item.namespace || payload.namespace || priorTool?.tool_namespace || null;
  return { text, role, call_id: callId, tool_namespace: namespace, tool_name: toolName, attachments, original_id: item.id || payload.id || record.id || null, unavailable_original: unavailableOriginal };
}

function historyBase(record) {
  const payload = record && typeof record.payload === 'object' ? record.payload : {};
  const base = payload.history_base || record.history_base;
  if (!base || typeof base !== 'object') return null;
  const thread = base.id || base.thread_id || base.thread;
  if (typeof thread !== 'string' || !thread) return null;
  return {
    thread,
    end_offset: Number.isInteger(base.end_byte_offset) ? base.end_byte_offset : (Number.isInteger(base.end_offset) ? base.end_offset : null),
    end_ordinal_exclusive: Number.isInteger(base.end_ordinal_exclusive) ? base.end_ordinal_exclusive : (Number.isInteger(base.end_ordinal) ? base.end_ordinal : null),
    source_file: typeof base.source_file === 'string' ? base.source_file : null,
    source_key: typeof base.source_key === 'string' ? base.source_key : null,
  };
}

function fenceMatches(file, bound) {
  if (!Number.isInteger(bound.end_offset) || bound.end_offset < 0) return false;
  const stat = fs.statSync(file);
  if (bound.end_offset > stat.size) return false;
  if (bound.end_offset === 0) return bound.end_ordinal_exclusive == null || bound.end_ordinal_exclusive === 0;
  const fd = fs.openSync(file, 'r');
  try {
    const end = bound.end_offset;
    const finalByte = Buffer.alloc(1);
    fs.readSync(fd, finalByte, 0, 1, end - 1);
    if (finalByte[0] !== 10) return false;
    const length = Math.min(end - 1, MAX_LINE_BYTES + 1);
    const tail = Buffer.alloc(length);
    fs.readSync(fd, tail, 0, length, end - 1 - length);
    const previous = tail.lastIndexOf(10);
    let line = tail.subarray(previous + 1).toString('utf8').replace(/\r$/, '');
    if (!line) return false;
    const record = parseJson(line, file, end - 1 - length + previous + 1);
    if (bound.end_ordinal_exclusive != null) {
      if (!Number.isInteger(record.ordinal) || record.ordinal + 1 !== bound.end_ordinal_exclusive) return false;
    }
    return true;
  } finally { fs.closeSync(fd); }
}

function boundCandidate(files, bound, db, visibleThread) {
  if (!bound) return files;
  let exactFile = null;
  if (bound.source_file) {
    exactFile = files.find((file) => file === bound.source_file);
  }
  if (!exactFile && bound.source_key) {
    const saved = db.prepare('SELECT source_file,source_dev,source_ino FROM import_sources WHERE visible_thread=? AND source_key=?').get(visibleThread, bound.source_key);
    if (saved?.source_file) exactFile = files.find((file) => file === saved.source_file);
    if (!exactFile && saved && (saved.source_dev || saved.source_ino)) {
      exactFile = files.find((file) => {
        const stat = fs.statSync(file);
        return String(stat.dev) === String(saved.source_dev) && String(stat.ino) === String(saved.source_ino);
      });
    }
  }
  if (exactFile) {
    if (!fenceMatches(exactFile, bound)) throw new MemoryError('source_boundary_unresolved', 'History base boundary does not match its source segment', { source_file: exactFile });
    return files.slice(0, files.indexOf(exactFile) + 1);
  }
  const matches = files.filter((file) => fenceMatches(file, bound));
  if (matches.length !== 1) throw new MemoryError('source_boundary_unresolved', 'History base boundary does not identify exactly one source segment', { origin_thread: bound.thread, candidates: matches.length });
  return files.slice(0, files.indexOf(matches[0]) + 1);
}

class MemoryBackend {
  constructor(settings) { this.settings = settings; this.db = openDb(settings.db_path); }
  close() { try { this.db.close(); } catch {} }

  receipt(thread, operation, args, requestId, fn) {
    if (!requestId) return fn();
    const argsJson = canonicalReceiptArgs(args);
    const old = this.db.prepare('SELECT thread,operation,args_json,result_json FROM write_receipts WHERE request_id=?').get(requestId);
    if (old) {
      if (old.thread !== thread || old.operation !== operation || old.args_json !== argsJson) throw new MemoryError('request_id_conflict', 'request_id was already used with a different thread, operation, or arguments');
      return JSON.parse(old.result_json);
    }
    const result = fn();
    this.db.prepare('INSERT INTO write_receipts(request_id,thread,operation,args_json,result_json,created) VALUES(?,?,?,?,?,?)')
      .run(requestId, thread, operation, argsJson, JSON.stringify(result), Date.now() / 1000);
    return result;
  }

  write(thread, args, append) {
    const p = notePath(args.path);
    if (typeof args.text !== 'string') throw new MemoryError('args_invalid', 'text must be a string');
    const old = this.db.prepare('SELECT text,created,revision FROM notes WHERE thread=? AND path=?').get(thread, p);
    const text = append && old ? old.text + args.text : args.text;
    if (Buffer.byteLength(text) > MAX_NOTE_BYTES) throw new MemoryError('note_too_large', `Note exceeds ${MAX_NOTE_BYTES} bytes`);
    const now = Date.now() / 1000; const revision = (old?.revision || 0) + 1;
    this.db.prepare(`INSERT INTO notes(thread,path,text,created,updated,revision) VALUES(?,?,?,?,?,?)
      ON CONFLICT(thread,path) DO UPDATE SET text=excluded.text,updated=excluded.updated,revision=excluded.revision`)
      .run(thread, p, text, old?.created || now, now, revision);
    let source; let history_error;
    if (p === '/root/notes/checkpoint.md') {
      try { source = this.ensureHistory(thread); }
      catch (error) { history_error = this.errorObject(error); }
    }
    return { path: p, revision, bytes: Buffer.byteLength(text), saved: true, source, history_error };
  }

  readFile(thread, args) {
    const p = notePath(args.path);
    const row = this.db.prepare('SELECT text,revision,updated FROM notes WHERE thread=? AND path=?').get(thread, p);
    if (!row) throw new MemoryError('note_not_found', 'Note was not found', { path: p });
    const lines = row.text.split('\n');
    const start = Math.max(1, Number.isInteger(args.start_line) ? args.start_line : 1);
    const stop = Math.min(lines.length, Number.isInteger(args.stop_line) ? args.stop_line : lines.length);
    return { path: p, text: lines.slice(start - 1, stop).join('\n'), start_line: start, stop_line: stop, total_lines: lines.length, truncated: stop < lines.length, revision: row.revision, updated: row.updated };
  }

  listFiles(thread, args) {
    const prefix = typeof args.prefix === 'string' ? args.prefix : '/root';
    const limit = Math.max(1, Math.min(500, Number(args.max_results) || 100));
    const order = args.file_order === 'desc' || args.file_order_by === 'updated' ? 'updated DESC' : 'path ASC';
    const rows = this.db.prepare(`SELECT path,revision,updated,length(text) chars FROM notes WHERE thread=? AND path LIKE ? ORDER BY ${order} LIMIT ?`).all(thread, `${prefix}%`, limit + 1);
    return { files: rows.slice(0, limit), has_more: rows.length > limit };
  }

  searchNotes(thread, args) {
    if (typeof args.query !== 'string' || !args.query) throw new MemoryError('args_invalid', 'query is required');
    const prefix = typeof args.path_prefix === 'string' ? args.path_prefix : '/root';
    const maxFiles = Math.max(1, Math.min(100, Number(args.max_files) || 20));
    const perFile = Math.max(1, Math.min(100, Number(args.max_matches_per_file) || 20));
    const order = args.recent_file_first === false ? 'path ASC' : 'updated DESC';
    const rows = this.db.prepare(`SELECT path,text,revision,updated FROM notes WHERE thread=? AND path LIKE ? AND instr(text,?)>0 ORDER BY ${order} LIMIT ?`).all(thread, `${prefix}%`, args.query, maxFiles + 1);
    const matches = [];
    for (const row of rows.slice(0, maxFiles)) {
      let from = 0;
      for (let i = 0; i < perFile; i++) {
        const at = row.text.indexOf(args.query, from); if (at < 0) break;
        matches.push({ path: row.path, revision: row.revision, offset_chars: at, preview: row.text.slice(Math.max(0, at - 120), at + args.query.length + 240) });
        from = at + Math.max(1, args.query.length);
      }
    }
    return { matches, has_more: rows.length > maxFiles };
  }

  sourceState(visibleThread, originThread, file, stat) {
    let row = null;
    if (stat.dev || stat.ino) row = this.db.prepare('SELECT * FROM import_sources WHERE visible_thread=? AND source_dev=? AND source_ino=?').get(visibleThread, String(stat.dev), String(stat.ino));
    if (row && row.source_file !== file) {
      this.db.prepare('UPDATE import_sources SET source_file=? WHERE visible_thread=? AND source_key=?').run(file, visibleThread, row.source_key);
      row = { ...row, source_file: file };
    }
    if (!row) {
      const byPath = this.db.prepare('SELECT * FROM import_sources WHERE visible_thread=? AND source_file=?').get(visibleThread, file);
      if (byPath && byPath.source_dev != null && (String(byPath.source_dev) !== String(stat.dev) || String(byPath.source_ino) !== String(stat.ino))) {
        if (byPath.status !== 'ready') throw new MemoryError('source_replaced', 'An unfinished history source was replaced', { source_file: file, source_key: byPath.source_key });
        this.db.prepare('UPDATE import_sources SET status=?,error=? WHERE visible_thread=? AND source_key=?').run('superseded', 'Source path now identifies a different completed segment', visibleThread, byPath.source_key);
      } else {
        row = byPath;
      }
    }
    const key = row?.source_key || `native:${crypto.randomUUID()}`;
    if (!row) {
      this.db.prepare('INSERT INTO import_sources(visible_thread,origin_thread,source_key,source_file,source_dev,source_ino,source_size,source_mtime,status) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(visibleThread, originThread, key, file, String(stat.dev), String(stat.ino), stat.size, stat.mtimeMs, 'new');
      row = this.db.prepare('SELECT * FROM import_sources WHERE visible_thread=? AND source_key=?').get(visibleThread, key);
    }
    return { row, key };
  }

  importSegment(visibleThread, requestedOrigin, file, stack, bound, budget, depth) {
    const headerRaw = firstLine(file);
    const header = parseJson(headerRaw, file, 0);
    const payload = header && typeof header.payload === 'object' ? header.payload : {};
    if (header.type !== 'session_meta' || !payload || typeof payload !== 'object') throw new MemoryError('source_header_invalid', 'History source must start with session_meta', { source_file: file });
    const originThread = payload.id || header.id || requestedOrigin;
    if (originThread !== requestedOrigin) throw new MemoryError('source_identity_mismatch', 'History source session id does not match the requested origin', { source_file: file, requested_origin: requestedOrigin, actual_origin: originThread });
    const initialWindow = payload.context_window?.window_id;
    const initialWindowNumber = payload.context_window?.window_number ?? 0;
    if (typeof initialWindow !== 'string' || !initialWindow) throw new MemoryError('source_header_invalid', 'session_meta.context_window.window_id is required', { source_file: file });
    const stat = fs.statSync(file);
    const { row: initial, key: sourceKey } = this.sourceState(visibleThread, originThread, file, stat);
    const stackKey = `${visibleThread}:${sourceKey}`;
    if (stack.has(stackKey)) throw new MemoryError('history_cycle', 'History base cycle detected', { source_file: file });
    stack.add(stackKey);
    try {
      const base = historyBase(header);
      if (base) this.importHistory(visibleThread, base.thread, stack, base, budget, depth + 1);
      this.db.prepare(`INSERT INTO windows(thread,window_id,previous_window_id,window_number,source_file,source_offset,item_count,raw,source_key)
        VALUES(?,?,NULL,?,?,0,0,?,?) ON CONFLICT(thread,window_id) DO UPDATE SET window_number=excluded.window_number,source_file=excluded.source_file,raw=excluded.raw,source_key=excluded.source_key`)
        .run(visibleThread, initialWindow, initialWindowNumber, file, headerRaw, sourceKey);
      if (stat.size < Number(initial.byte_offset || 0)) throw new MemoryError('source_shrunk', 'History source is shorter than its saved cursor', { source_file: file });
      const endLimit = bound?.end_offset != null ? Math.min(stat.size, bound.end_offset) : stat.size;
      let offset = Number(initial.byte_offset || 0);
      if (offset >= endLimit || budget.bytes >= MAX_IMPORT_BYTES || budget.records >= MAX_IMPORT_RECORDS) {
        return { source_key: sourceKey, source_file: file, status: offset >= endLimit ? 'ready' : 'catching_up', byte_offset: offset, source_boundary: endLimit };
      }
      let bytes = Math.min(endLimit - offset, MAX_IMPORT_BYTES - budget.bytes);
      const fd = fs.openSync(file, 'r');
      let buffer = Buffer.alloc(bytes);
      let got;
      let singleLargeLine = false;
      try {
        got = fs.readSync(fd, buffer, 0, bytes, offset);
        if (buffer.subarray(0, got).indexOf(10) < 0 && offset + got < endLimit) {
          bytes = Math.min(endLimit - offset, MAX_LINE_BYTES + 1);
          buffer = Buffer.alloc(bytes);
          got = fs.readSync(fd, buffer, 0, bytes, offset);
          const firstNewline = buffer.subarray(0, got).indexOf(10);
          if (firstNewline < 0 && endLimit - offset > MAX_LINE_BYTES) throw new MemoryError('source_line_too_large', `History line exceeds ${MAX_LINE_BYTES} bytes`, { source_file: file, source_offset: offset });
          singleLargeLine = firstNewline >= 0;
        }
      } finally { fs.closeSync(fd); }
      const newline = singleLargeLine ? buffer.subarray(0, got).indexOf(10) : buffer.subarray(0, got).lastIndexOf(10);
      const usable = newline < 0 ? 0 : newline + 1;
      let cursor = 0; let sourceOrdinalCounter = Number(initial.ordinal || 0); let visibleOrdinal = Number(this.db.prepare('SELECT coalesce(max(ordinal),-1)+1 value FROM items WHERE visible_thread=?').get(visibleThread).value); let currentWindow = initial.last_window_id || initialWindow; let priorTool = null;
      while (cursor < usable && budget.records < MAX_IMPORT_RECORDS) {
        let newline = buffer.indexOf(10, cursor); if (newline < 0 || newline >= usable) newline = usable;
        let rawBuffer = buffer.subarray(cursor, newline); if (rawBuffer.at(-1) === 13) rawBuffer = rawBuffer.subarray(0, rawBuffer.length - 1);
        if (rawBuffer.length > MAX_LINE_BYTES) throw new MemoryError('source_line_too_large', `History line exceeds ${MAX_LINE_BYTES} bytes`, { source_file: file, source_offset: offset + cursor });
        const raw = rawBuffer.toString('utf8'); const lineOffset = offset + cursor;
        cursor = newline < usable ? newline + 1 : usable;
        if (!raw) continue;
        const record = parseJson(raw, file, lineOffset);
        const nativeOrdinal = Number.isInteger(record.ordinal) ? record.ordinal : null;
        if (bound?.end_ordinal_exclusive != null && nativeOrdinal != null && nativeOrdinal >= bound.end_ordinal_exclusive) {
          cursor = lineOffset - offset;
          break;
        }
        const recordBase = historyBase(record);
        if (recordBase) {
          this.importHistory(visibleThread, recordBase.thread, stack, recordBase, budget, depth + 1);
          visibleOrdinal = Number(this.db.prepare('SELECT coalesce(max(ordinal),-1)+1 value FROM items WHERE visible_thread=?').get(visibleThread).value);
        }
        const compact = record.type === 'compacted' ? (record.payload || record) : null;
        if (compact) {
          currentWindow = compact.window_id || currentWindow;
          this.db.prepare(`INSERT INTO windows(thread,window_id,previous_window_id,window_number,source_file,source_offset,item_count,raw,source_key)
            VALUES(?,?,?,?,?,?,0,?,?) ON CONFLICT(thread,window_id) DO UPDATE SET previous_window_id=excluded.previous_window_id,window_number=excluded.window_number,source_file=excluded.source_file,source_offset=excluded.source_offset,raw=excluded.raw,source_key=excluded.source_key`)
            .run(visibleThread, currentWindow, compact.previous_window_id || null, compact.window_number ?? null, file, lineOffset, raw, sourceKey);
        }
        const normalized = normalizeHistoryItem(record, priorTool);
        if (normalized.tool_name) priorTool = { tool_name: normalized.tool_name, tool_namespace: normalized.tool_namespace };
        const old = this.db.prepare('SELECT canonical_id FROM items WHERE visible_thread=? AND source_key=? AND source_offset=?').get(visibleThread, sourceKey, lineOffset);
        const canonicalId = old?.canonical_id || `${originThread}:${sourceKey}:byte:${lineOffset}`;
        const result = this.db.prepare(`INSERT OR IGNORE INTO items(visible_thread,origin_thread,canonical_id,original_id,window_id,ordinal,source_file,source_offset,raw,text,role,call_id,tool_namespace,tool_name,attachments,truncated,source_ordinal,source_key,provenance,unavailable_original)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(visibleThread, originThread, canonicalId, normalized.original_id, currentWindow, visibleOrdinal, file, lineOffset, raw, normalized.text, normalized.role, normalized.call_id, normalized.tool_namespace, normalized.tool_name, JSON.stringify(normalized.attachments), 0, Number.isInteger(record.ordinal) ? record.ordinal : null, sourceKey, 'native_full_record', normalized.unavailable_original ? 1 : 0);
        if (result.changes) {
          this.db.prepare('UPDATE windows SET item_count=item_count+1 WHERE thread=? AND window_id=?').run(visibleThread, currentWindow);
          visibleOrdinal++;
        }
        sourceOrdinalCounter++; budget.records++; budget.bytes += rawBuffer.length + (newline < usable ? 1 : 0);
      }
      offset += cursor;
      const status = offset >= endLimit ? 'ready' : 'catching_up';
      this.db.prepare(`UPDATE import_sources SET origin_thread=?,source_file=?,source_dev=?,source_ino=?,source_size=?,source_mtime=?,byte_offset=?,ordinal=?,status=?,source_boundary=?,history_base_thread=?,history_base_end=?,history_base_end_ordinal=?,last_window_id=?,error=NULL WHERE visible_thread=? AND source_key=?`)
        .run(originThread, file, String(stat.dev), String(stat.ino), stat.size, stat.mtimeMs, offset, sourceOrdinalCounter, status, endLimit, base?.thread || null, base?.end_offset || null, base?.end_ordinal_exclusive || null, currentWindow, visibleThread, sourceKey);
      return { source_key: sourceKey, source_file: file, status, byte_offset: offset, source_size: stat.size, source_boundary: endLimit, partial_tail: usable === 0 && offset < endLimit };
    } catch (error) {
      this.db.prepare('UPDATE import_sources SET status=?,error=? WHERE visible_thread=? AND source_key=?').run('error', error.message, visibleThread, sourceKey);
      throw error;
    } finally { stack.delete(stackKey); }
  }

  importHistory(visibleThread, originThread = visibleThread, stack = new Set(), bound = null, budget = null, depth = 0) {
    if (depth > MAX_HISTORY_DEPTH) throw new MemoryError('history_depth', `History base depth exceeds ${MAX_HISTORY_DEPTH}`);
    const shared = budget || { bytes: 0, records: 0 };
    const files = sourceCandidates(this.settings.codex_home, originThread);
    if (!files.length) {
      const cached = this.db.prepare('SELECT count(*) count FROM items WHERE visible_thread=? AND origin_thread=?').get(visibleThread, originThread).count;
      if (cached) return { status: 'cached', files: [], records: shared.records, bytes: shared.bytes };
      throw new MemoryError('source_not_found', 'No history source was found', { origin_thread: originThread });
    }
    const selectedFiles = boundCandidate(files, bound, this.db, visibleThread);
    const states = [];
    const boundaryFile = bound ? selectedFiles.at(-1) : null;
    for (const file of selectedFiles) {
      if (shared.bytes >= MAX_IMPORT_BYTES || shared.records >= MAX_IMPORT_RECORDS) break;
      states.push(this.importSegment(visibleThread, originThread, file, stack, file === boundaryFile ? bound : null, shared, depth));
    }
    const complete = states.length === selectedFiles.length && states.every((x) => x.status === 'ready');
    return { status: complete ? 'ready' : 'catching_up', files: states, records: shared.records, bytes: shared.bytes };
  }

  ensureHistory(thread) { return this.importHistory(thread); }

  windows(thread, args) {
    const limit = Math.max(1, Math.min(500, Number(args.limit) || 100)); const order = args.recent_first === false ? 'ASC' : 'DESC';
    let source; let history_error; try { source = this.ensureHistory(thread); } catch (e) { history_error = this.errorObject(e); }
    const rows = this.db.prepare(`SELECT * FROM windows WHERE thread=? AND NOT EXISTS(
      SELECT 1 FROM import_sources s WHERE s.visible_thread=windows.thread AND s.source_key=windows.source_key AND s.status='superseded')
      ORDER BY coalesce(window_number,source_offset) ${order} LIMIT ?`).all(thread, limit + 1);
    return { windows: rows.slice(0, limit), has_more: rows.length > limit, source, history_error };
  }

  items(thread, args) {
    const where = ['visible_thread=?', "NOT EXISTS(SELECT 1 FROM import_sources s WHERE s.visible_thread=items.visible_thread AND s.source_key=items.source_key AND s.status='superseded')"]; const params = [thread];
    for (const key of ['window_id', 'role', 'tool_namespace', 'tool_name']) if (typeof args[key] === 'string') { where.push(`${key}=?`); params.push(args[key]); }
    const limit = Math.max(1, Math.min(500, Number(args.limit) || 100)); const order = args.recent_first === false ? 'ASC' : 'DESC';
    let source; let history_error; try { source = this.ensureHistory(thread); } catch (e) { history_error = this.errorObject(e); }
    const rows = this.db.prepare(`SELECT canonical_id item_id,origin_thread,window_id,ordinal,role,tool_namespace,tool_name,substr(text,1,?) text,provenance,unavailable_original FROM items WHERE ${where.join(' AND ')} ORDER BY ordinal ${order} LIMIT ?`).all(Number(args.max_chars_per_item) || 400, ...params, limit + 1);
    return { items: rows.slice(0, limit), has_more: rows.length > limit, source, history_error };
  }

  item(thread, args) {
    if (typeof args.item_id !== 'string' || !args.item_id) throw new MemoryError('args_invalid', 'item_id is required');
    if (args.format != null && !['text', 'raw'].includes(args.format)) throw new MemoryError('args_invalid', 'format must be text or raw');
    const lookup = () => this.db.prepare(`SELECT canonical_id item_id,origin_thread,window_id,ordinal,role,tool_namespace,tool_name,source_file,source_offset,source_key,provenance,unavailable_original FROM items WHERE visible_thread=? AND canonical_id=?${args.window_id ? ' AND window_id=?' : ''}`).get(thread, args.item_id, ...(args.window_id ? [args.window_id] : []));
    let row = lookup(); let source;
    if (!row) { source = this.ensureHistory(thread); row = lookup(); }
    if (!row) throw new MemoryError('item_not_found', 'History item was not found', { item_id: args.item_id });
    const format = args.format || 'text'; const column = format === 'raw' ? 'raw' : 'text';
    const offset = Math.max(0, Number(args.offset_chars) || 0); const limit = Math.max(1, Math.min(DEFAULT_READ_CHARS, Number(args.limit_chars) || DEFAULT_READ_CHARS));
    const page = this.db.prepare(`SELECT length(${column}) total_chars,substr(${column},?,?) content FROM items WHERE visible_thread=? AND canonical_id=?`).get(offset + 1, limit, thread, args.item_id);
    const content = page.content || ''; const count = charLength(content); const next = offset + count < page.total_chars ? offset + count : null;
    return { ...row, format, content, offset_chars: offset, n_chars: count, next_offset_chars: next, truncated: next != null, source };
  }

  searchHistory(thread, args) {
    if (typeof args.query !== 'string' || !args.query) throw new MemoryError('args_invalid', 'query is required');
    const where = ['visible_thread=?', 'instr(text,?)>0', "NOT EXISTS(SELECT 1 FROM import_sources s WHERE s.visible_thread=items.visible_thread AND s.source_key=items.source_key AND s.status='superseded')"]; const params = [thread, args.query];
    for (const key of ['window_id', 'role', 'tool_namespace', 'tool_name']) if (typeof args[key] === 'string') { where.push(`${key}=?`); params.push(args[key]); }
    const limit = Math.max(1, Math.min(500, Number(args.limit) || 100)); let source; let history_error;
    try { source = this.ensureHistory(thread); } catch (e) { history_error = this.errorObject(e); }
    const rows = this.db.prepare(`SELECT canonical_id item_id,origin_thread,window_id,ordinal,role,tool_namespace,tool_name,substr(text,max(1,instr(text,?)-120),360) preview,provenance,unavailable_original FROM items WHERE ${where.join(' AND ')} ORDER BY ordinal DESC LIMIT ?`).all(args.query, ...params, limit + 1);
    return { matches: rows.slice(0, limit), has_more: rows.length > limit, source, history_error };
  }

  record(thread, args) {
    if (typeof args.stable_id !== 'string' || !args.stable_id) throw new MemoryError('args_invalid', 'stable_id is required');
    const origin = typeof args.origin_thread === 'string' && args.origin_thread ? args.origin_thread : thread;
    const canonicalId = `harness:${origin}:${args.stable_id}`; const windowId = args.window_id || `harness:${thread}`;
    const raw = typeof args.raw === 'string' ? args.raw : JSON.stringify(args.payload ?? args);
    const text = typeof args.text === 'string' ? args.text : stringsFrom(args.payload ?? args).join('\n');
    const ordinal = Number(this.db.prepare('SELECT coalesce(max(ordinal),-1)+1 value FROM items WHERE visible_thread=?').get(thread).value);
    this.db.prepare('INSERT OR IGNORE INTO windows(thread,window_id,previous_window_id,window_number,source_file,source_offset,item_count,raw,source_key) VALUES(?,?,NULL,NULL,NULL,NULL,0,NULL,?)').run(thread, windowId, `harness:${origin}`);
    const result = this.db.prepare(`INSERT OR IGNORE INTO items(visible_thread,origin_thread,canonical_id,original_id,window_id,ordinal,source_file,source_offset,raw,text,role,call_id,tool_namespace,tool_name,attachments,truncated,source_ordinal,source_key,provenance,unavailable_original)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).run(thread, origin, canonicalId, args.stable_id, windowId, ordinal, null, null, raw, text, args.role || null, args.call_id || null, args.tool_namespace || null, args.tool_name || null, JSON.stringify(args.refs || []), 0, null, `harness:${origin}`, 'harness_record');
    if (result.changes) this.db.prepare('UPDATE windows SET item_count=item_count+1 WHERE thread=? AND window_id=?').run(thread, windowId);
    return { item_id: canonicalId, window_id: windowId, provenance: 'harness_record', saved: Boolean(result.changes) };
  }

  bootstrap(thread) {
    let source; let history_error; try { source = this.ensureHistory(thread); } catch (e) { history_error = this.errorObject(e); }
    const checkpointRow = this.db.prepare('SELECT text,revision,updated FROM notes WHERE thread=? AND path=?').get(thread, '/root/notes/checkpoint.md');
    const checkpoint = checkpointRow ? { path: '/root/notes/checkpoint.md', text: checkpointRow.text, revision: checkpointRow.revision, updated: checkpointRow.updated, offset_chars: 0, truncated: false, next_offset_chars: null } : null;
    const userRefs = this.db.prepare(`SELECT canonical_id item_id,origin_thread,window_id,ordinal,substr(text,1,400) preview,provenance FROM items
      WHERE visible_thread=? AND role='user' AND text<>'' AND NOT EXISTS(
        SELECT 1 FROM import_sources s WHERE s.visible_thread=items.visible_thread AND s.source_key=items.source_key AND s.status='superseded')
      ORDER BY ordinal DESC LIMIT 5`).all(thread);
    return { thread_id: thread, checkpoint, source, history_error, user_refs: userRefs, settings_path: this.settings.settings_path, skill_path: this.settings.skill_path, node_path: this.settings.node_path, cli_path: this.settings.cli_path };
  }

  errorObject(error) { return { code: error.code || 'internal_error', message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }; }

  dispatch(operation, thread, args, requestId, maxBytes) {
    const methods = {
      'notes.write_file': () => this.write(thread, args, false),
      'notes.append_to_file': () => this.write(thread, args, true),
      'notes.read_file': () => this.readFile(thread, args),
      'notes.list_files_by_prefix': () => this.listFiles(thread, args),
      'notes.search_contents': () => this.searchNotes(thread, args),
      'history.list_windows': () => this.windows(thread, args),
      'history.list_items': () => this.items(thread, args),
      'history.read_item': () => this.item(thread, args),
      'history.search_contents': () => this.searchHistory(thread, args),
      'history.record': () => this.record(thread, args),
      'context.bootstrap': () => this.bootstrap(thread),
    };
    const fn = methods[operation]; if (!fn) throw new MemoryError('operation_unknown', `Unknown operation: ${operation}`);
    const mutating = ['notes.write_file', 'notes.append_to_file', 'history.record'].includes(operation);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = mutating ? this.receipt(thread, operation, args, requestId, fn) : fn();
      const fitted = fitResult(result, maxBytes);
      this.db.exec('COMMIT'); return fitted;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
}

function parseArgs(argv) {
  if (argv[0] !== 'call' || !argv[1]) throw new MemoryError('usage', 'Usage: memory.js call OP [--thread-id ID] [--settings PATH]');
  const parsed = { operation: argv[1], thread: process.env.CODEX_THREAD_ID || null, settings: null, request_id: null, max_output_bytes: null };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === '--thread-id' || argv[i] === '--thread_id') && argv[i + 1]) parsed.thread = argv[++i];
    else if (argv[i].startsWith('--thread-id=') || argv[i].startsWith('--thread_id=')) parsed.thread = argv[i].slice(argv[i].indexOf('=') + 1);
    else if (argv[i] === '--settings' && argv[i + 1]) parsed.settings = argv[++i];
    else if (argv[i].startsWith('--settings=')) parsed.settings = argv[i].slice('--settings='.length);
    else if ((argv[i] === '--request-id' || argv[i] === '--request_id') && argv[i + 1]) parsed.request_id = argv[++i];
    else if (argv[i].startsWith('--request-id=') || argv[i].startsWith('--request_id=')) parsed.request_id = argv[i].slice(argv[i].indexOf('=') + 1);
    else if ((argv[i] === '--max-output-bytes' || argv[i] === '--max_output_bytes') && argv[i + 1]) {
      parsed.max_output_bytes = Number(argv[++i]);
      if (!Number.isInteger(parsed.max_output_bytes) || parsed.max_output_bytes < 256) throw new MemoryError('usage', '--max-output-bytes must be an integer of at least 256');
    }
    else if (argv[i].startsWith('--max-output-bytes=') || argv[i].startsWith('--max_output_bytes=')) {
      parsed.max_output_bytes = Number(argv[i].slice(argv[i].indexOf('=') + 1));
      if (!Number.isInteger(parsed.max_output_bytes) || parsed.max_output_bytes < 256) throw new MemoryError('usage', '--max-output-bytes must be an integer of at least 256');
    }
    else throw new MemoryError('usage', `Unknown argument: ${argv[i]}`);
  }
  if (typeof parsed.thread !== 'string' || !parsed.thread) throw new MemoryError('thread_id_missing', 'A nonempty --thread-id or CODEX_THREAD_ID is required');
  if (parsed.request_id != null && (typeof parsed.request_id !== 'string' || !parsed.request_id || Buffer.byteLength(parsed.request_id) > 512)) throw new MemoryError('request_id_invalid', 'request_id must be a nonempty string of at most 512 bytes');
  return parsed;
}

function readInput() {
  const buffer = fs.readFileSync(0); if (buffer.length > MAX_STDIN_BYTES) throw new MemoryError('stdin_too_large', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
  if (!buffer.length) return {};
  let value; try { value = JSON.parse(buffer.toString('utf8')); } catch (error) { throw new MemoryError('stdin_invalid', `stdin must be JSON: ${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MemoryError('stdin_invalid', 'stdin must be a JSON object');
  return value;
}

function emit(value, max) {
  let text = JSON.stringify(value);
  if (Buffer.byteLength(text) + 1 > max) {
    text = JSON.stringify({ version: 1, request_id: value.request_id, error: { code: 'output_too_large', message: 'Output exceeds configured limit' } });
    if (Buffer.byteLength(text) + 1 > max) text = JSON.stringify({ version: 1, error: { code: 'output_too_large' } });
  }
  process.stdout.write(`${text}\n`);
}

function main() {
  let requestId = null; let max = MAX_OUTPUT_BYTES; let backend;
  try {
    const cli = parseArgs(process.argv.slice(2)); const settings = readSettings(cli.settings);
    const requestedMax = cli.max_output_bytes ?? (Number(settings.max_output_bytes) || MAX_OUTPUT_BYTES);
    max = Math.max(256, Math.min(MAX_OUTPUT_BYTES, Number.isFinite(requestedMax) ? Math.floor(requestedMax) : MAX_OUTPUT_BYTES));
    const input = readInput(); requestId = cli.request_id || (typeof input.request_id === 'string' ? input.request_id : crypto.randomUUID());
    if (!requestId || Buffer.byteLength(requestId) > 512) throw new MemoryError('request_id_invalid', 'request_id must be a nonempty string of at most 512 bytes');
    const args = input.args && typeof input.args === 'object' && !Array.isArray(input.args) ? structuredClone(input.args) : Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'request_id'));
    const envelopeOverhead = jsonBytes({ version: 1, request_id: requestId, result: null }) - 4;
    backend = new MemoryBackend(settings); const result = backend.dispatch(cli.operation, cli.thread, args, requestId, Math.max(32, max - envelopeOverhead - 1));
    emit({ version: 1, request_id: requestId, result }, max);
  } catch (error) {
    const body = { version: 1, request_id: requestId, error: { code: error.code || 'internal_error', message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } };
    if (Buffer.byteLength(JSON.stringify(body)) > max) delete body.error.details;
    emit(body, max); process.exitCode = 1;
  } finally { backend?.close(); }
}

if (require.main === module) main();
module.exports = { MemoryBackend, MemoryError, readSettings, defaults, fitResult, notePath };
