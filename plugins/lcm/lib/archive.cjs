// Adapted from lossless-claude/lcm's Codex transcript, store and compaction
// approach (MIT; see ../LICENSE). The raw JSONL line is authoritative; the
// extracted text is only an index and summarizer input.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { TextDecoder } = require('node:util');
const { DatabaseSync } = require('node:sqlite');

const MAX_CHUNK_CHARS = 48000;
const MAX_CONTEXT_BYTES = 8000;
const utf8 = new TextDecoder('utf-8', { fatal: true });

function archivePath() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(codexHome, 'lcm', 'archive.sqlite');
}

function openArchive() {
  const file = archivePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.closeSync(fs.openSync(file, 'a', 0o600));
  fs.chmodSync(file, 0o600);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      byte_offset INTEGER NOT NULL,
      role TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      search_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, byte_offset)
    );
    CREATE INDEX IF NOT EXISTS records_session ON records(session_id, byte_offset);
    CREATE TABLE IF NOT EXISTS cursors (
      session_id TEXT NOT NULL,
      transcript_path TEXT NOT NULL,
      byte_offset INTEGER NOT NULL,
      PRIMARY KEY(session_id, transcript_path)
    );
    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      depth INTEGER NOT NULL,
      content TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS summaries_active ON summaries(session_id, active, created_at);
    CREATE TABLE IF NOT EXISTS summary_sources (
      summary_id TEXT NOT NULL REFERENCES summaries(id),
      source_id TEXT NOT NULL REFERENCES records(id),
      PRIMARY KEY(summary_id, source_id)
    );
    CREATE TABLE IF NOT EXISTS summary_children (
      parent_id TEXT NOT NULL REFERENCES summaries(id),
      child_id TEXT NOT NULL REFERENCES summaries(id),
      PRIMARY KEY(parent_id, child_id)
    );
    CREATE TABLE IF NOT EXISTS summarized_sources (
      source_id TEXT PRIMARY KEY REFERENCES records(id),
      summary_id TEXT NOT NULL REFERENCES summaries(id)
    );
  `);
  return db;
}

function sourceId(sessionId, offset) {
  return 'msg_' + createHash('sha256').update(`${sessionId}:${offset}`).digest('hex').slice(0, 20);
}

function extractText(payload) {
  const text = [];
  function walk(value, key = '', depth = 0) {
    if (depth > 12) return;
    if (typeof value === 'string') {
      if (/^(text|input|output|arguments|command|name)$/i.test(key)) text.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, key, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const [childKey, item] of Object.entries(value)) walk(item, childKey, depth + 1);
    }
  }
  walk(payload);
  return text.join('\n');
}

function ingestTranscript(db, sessionId, transcriptPath) {
  if (!sessionId || !transcriptPath || !path.isAbsolute(transcriptPath)) {
    throw new Error('missing session ID or absolute transcript path');
  }
  const bytes = fs.readFileSync(transcriptPath);
  const old = db.prepare('SELECT byte_offset FROM cursors WHERE session_id=? AND transcript_path=?')
    .get(sessionId, transcriptPath);
  const start = old ? Number(old.byte_offset) : 0;
  if (start > bytes.length) throw new Error('transcript became shorter than saved cursor');
  let position = start;
  let count = 0;
  const insert = db.prepare(`INSERT OR IGNORE INTO records
    (id, session_id, byte_offset, role, raw_json, search_text) VALUES (?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN IMMEDIATE');
  try {
    while (position < bytes.length) {
      const end = bytes.indexOf(0x0a, position);
      if (end < 0) break; // A live final JSONL record may still be in flight.
      const raw = utf8.decode(bytes.subarray(position, end)).replace(/\r$/, '');
      if (raw.trim()) {
        let entry;
        try { entry = JSON.parse(raw); }
        catch { throw new Error(`invalid transcript JSONL at byte ${position}`); }
        if (entry && entry.type === 'session_meta' &&
            typeof entry.payload?.id === 'string' && entry.payload.id !== sessionId) {
          throw new Error('transcript session ID does not match hook session ID');
        }
        if (entry && entry.type === 'response_item') {
          const payload = entry.payload || {};
          const role = typeof payload.role === 'string' ? payload.role :
            typeof payload.type === 'string' ? payload.type : 'response_item';
          insert.run(sourceId(sessionId, position), sessionId, position, role, raw, extractText(payload));
          count++;
        }
      }
      position = end + 1;
    }
    db.prepare(`INSERT INTO cursors(session_id, transcript_path, byte_offset) VALUES(?, ?, ?)
      ON CONFLICT(session_id, transcript_path) DO UPDATE SET byte_offset=excluded.byte_offset`)
      .run(sessionId, transcriptPath, position);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return count;
}

function pendingSourceChunk(db, sessionId) {
  const rows = db.prepare(`SELECT r.id, r.role, r.search_text FROM records r
    LEFT JOIN summarized_sources ss ON ss.source_id=r.id
    WHERE r.session_id=? AND ss.source_id IS NULL AND r.search_text<>''
    ORDER BY r.byte_offset DESC LIMIT 40`).all(sessionId);
  if (rows.length === 0) return [];
  const selected = [];
  let chars = 0;
  for (const row of rows) {
    if (selected.length && chars + row.search_text.length > MAX_CHUNK_CHARS) break;
    selected.push(row);
    chars += row.search_text.length;
    if (chars >= MAX_CHUNK_CHARS) break;
  }
  return selected.reverse();
}

function boundedSourceText(value) {
  if (value.length <= MAX_CHUNK_CHARS) return value;
  const half = Math.floor((MAX_CHUNK_CHARS - 100) / 2);
  return `${value.slice(0, half)}\n[... middle omitted; use source ID for full original ...]\n${value.slice(-half)}`;
}

function createLeaf(db, sessionId, rows, content) {
  const id = 'sum_' + randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO summaries(id, session_id, depth, content) VALUES(?, ?, 0, ?)')
      .run(id, sessionId, content);
    const source = db.prepare('INSERT INTO summary_sources(summary_id, source_id) VALUES(?, ?)');
    const mark = db.prepare('INSERT INTO summarized_sources(source_id, summary_id) VALUES(?, ?)');
    for (const row of rows) {
      source.run(id, row.id);
      mark.run(row.id, id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return id;
}

function condensationCandidates(db, sessionId) {
  const rows = db.prepare(`SELECT id, depth, content FROM summaries
    WHERE session_id=? AND active=1 ORDER BY created_at, rowid`).all(sessionId);
  return rows.length > 6 ? rows.slice(0, 4) : [];
}

function createParent(db, sessionId, children, content) {
  const id = 'sum_' + randomUUID();
  const depth = 1 + Math.max(...children.map(item => Number(item.depth)));
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO summaries(id, session_id, depth, content) VALUES(?, ?, ?, ?)')
      .run(id, sessionId, depth, content);
    const child = db.prepare('INSERT INTO summary_children(parent_id, child_id) VALUES(?, ?)');
    const deactivate = db.prepare('UPDATE summaries SET active=0 WHERE id=? AND active=1');
    for (const item of children) {
      child.run(id, item.id);
      if (deactivate.run(item.id).changes !== 1) throw new Error('summary frontier changed');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return id;
}

function contextForSession(db, sessionId, cliPath) {
  const rows = db.prepare(`SELECT id, depth, content FROM summaries
    WHERE session_id=? AND active=1 ORDER BY created_at DESC, rowid DESC`).all(sessionId);
  if (!rows.length) return '';
  const sources = db.prepare('SELECT source_id FROM summary_sources WHERE summary_id=?');
  const children = db.prepare('SELECT child_id FROM summary_children WHERE parent_id=?');
  let context = `LCM archive for this main session. These are extra notes after native Codex compaction; check originals when exact detail matters. Search with node "${cliPath}" search <query>; follow summaries and reveal originals with node "${cliPath}" expand <id>.\n`;
  for (const row of rows) {
    const refs = row.depth === 0
      ? sources.all(row.id).map(item => item.source_id)
      : children.all(row.id).map(item => item.child_id);
    const entry = `\n[${row.id}; ${row.depth ? 'child summaries' : 'source records'}: ${refs.join(', ')}]\n${row.content.trim()}\n`;
    if (Buffer.byteLength(context + entry, 'utf8') > MAX_CONTEXT_BYTES) continue;
    context += entry;
  }
  return context.includes('[sum_') ? context : '';
}

function search(db, query) {
  if (!query || !query.trim()) throw new Error('search query is required');
  const escaped = query.replace(/[\\%_]/g, '\\$&');
  return db.prepare(`SELECT id, session_id, role, search_text FROM records
    WHERE search_text LIKE ? ESCAPE '\\' ORDER BY created_at DESC, rowid DESC LIMIT 20`)
    .all(`%${escaped}%`).map(row => ({
      id: row.id,
      session_id: row.session_id,
      role: row.role,
      snippet: row.search_text.replace(/\s+/g, ' ').slice(0, 200),
    }));
}

function expand(db, id) {
  const record = db.prepare('SELECT raw_json FROM records WHERE id=?').get(id);
  if (record) return record.raw_json;

  const summary = db.prepare('SELECT id, depth, content FROM summaries WHERE id=?').get(id);
  if (!summary) return null;

  const refs = summary.depth === 0
    ? db.prepare('SELECT source_id AS id FROM summary_sources WHERE summary_id=? ORDER BY rowid')
      .all(id).map(item => item.id)
    : db.prepare('SELECT child_id AS id FROM summary_children WHERE parent_id=? ORDER BY rowid')
      .all(id).map(item => item.id);
  const label = summary.depth === 0 ? 'source records' : 'child summaries';
  return `[${summary.id}; ${label}: ${refs.join(', ')}]\n${summary.content}`;
}

module.exports = {
  openArchive, ingestTranscript, pendingSourceChunk, boundedSourceText,
  createLeaf, condensationCandidates, createParent, contextForSession, search, expand,
};
