'use strict';

const { createHash } = require('node:crypto');
const { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { homedir, tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const zlib = require('node:zlib');

// Session history of a Codex rollout. Required as a library it loads one session into records with
// authority labels; run as a CLI it pages the complete raw history with explicit cursors.
const ID_PATTERN = /^[0-9A-Za-z][0-9A-Za-z_-]{0,127}$/;
const DEFAULT_BUDGET = 40000;
const MAX_BUDGET = 1000000;
// Owner text is user.text; user.image beside it is not text. Context kinds are injected by the harness in the user
// role and never carry owner authority. "unknown" is not listed: a message of that kind stays unclassified.
const OWNER_KIND = new Set(['user.text', 'user.image']);
const KNOWN_CONTEXT_KIND = /^(agents_md\.|skills\.|goal\.|additional_content\.|plugins\.|environments\.|hooks\.additional_context$|host_skills\.|permissions\.|collaboration_mode\.|generic\.|multi_agent\.|model_switch\.|apps\.|token_budget\.|images\.|user\.heartbeat$)/;

// A stop hook's prompt is a user message of the single kind "unknown" whose text is one whole hook_prompt element:
// harness context, not an owner message. No other unknown message is exempt.
const HOOK_PROMPT = /^<hook_prompt hook_run_id="[^"]*">[\s\S]*<\/hook_prompt>$/;

function codexHome() {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

function validSessionId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// Each capture gets a private directory in the OS temporary directory (mkdtemp: 0700) and a 0600 snapshot file.
// Nothing is shared between captures; the hash checks the bytes and does not name the path.
// Copies the original bytes once into the snapshot and hashes those same bytes, so the hash, the snapshot and the
// records describe one state of the file.
function captureSource(file) {
  const original = resolve(file);
  const raw = readFileSync(original);
  const hash = sha256(raw);
  const dir = mkdtempSync(join(tmpdir(), 'scope-focus-history-'));
  const snapshot = join(dir, original.endsWith('.zst') ? 'snapshot.jsonl.zst' : 'snapshot.jsonl');
  writeFileSync(snapshot, raw, { flag: 'wx', mode: 0o600 });
  return { original, snapshot, sha256: hash, raw };
}

// An explicit snapshot, or a later page of one, is read as it is: no new copy is made.
function readSnapshot(file) {
  const original = resolve(file);
  const raw = readFileSync(original);
  return { original, snapshot: original, sha256: sha256(raw), raw };
}

// Finds the rollout file of one session under sessions/ and archived_sessions/.
function locate(sessionId) {
  if (!validSessionId(sessionId)) throw new Error(`invalid session id "${sessionId}"`);
  const roots = [join(codexHome(), 'sessions'), join(codexHome(), 'archived_sessions')];
  const found = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(`-${sessionId}.jsonl`) || name.endsWith(`-${sessionId}.jsonl.zst`)) found.push(full);
    }
  };
  roots.forEach(walk);
  if (found.length === 0) throw new Error(`no rollout file for session ${sessionId} under ${roots.join(', ')}`);
  if (found.length > 1) throw new Error(`several rollout files for session ${sessionId}: ${found.join(', ')}`);
  return found[0];
}

function readText(raw, file) {
  if (file.endsWith('.zst')) {
    if (typeof zlib.zstdDecompressSync !== 'function') throw new Error('zstd decompression is not available in this Node');
    return zlib.zstdDecompressSync(raw).toString('utf8');
  }
  return raw.toString('utf8');
}

// Splits JSONL into records. A complete line must parse; an incomplete final line of a live file is
// ignored and recorded as a limitation.
function parseLines(text) {
  const records = [];
  const limitations = [];
  const lines = text.split('\n');
  const last = lines.length - 1;
  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    const isTail = index === last;
    try {
      records.push({ line: index + 1, raw: JSON.parse(line) });
    } catch (error) {
      if (isTail) limitations.push(`incomplete final line ${index + 1} ignored (live file)`);
      else throw new Error(`invalid JSON on line ${index + 1}: ${error.message}`);
    }
  });
  return { records, limitations };
}

function userKinds(record) {
  const payload = record.payload ?? {};
  const meta = payload.internal_chat_message_metadata_passthrough ?? {};
  return Array.isArray(meta.content_item_kinds) ? meta.content_item_kinds : [];
}

function contentText(content) {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : '';
  return content.flatMap((part) => (typeof part?.text === 'string' ? [part.text] : [])).join('\n');
}

// Classifies one record. A user message is owner text when its content kinds include user.text: the text
// parts are kept, image parts beside them do not change that. Other user kinds are context; a user message
// whose kinds are absent or unknown is unclassified and gives no authority.
function classify(record) {
  const payload = record.payload ?? {};
  if (record.type === 'session_meta') return { kind: 'session_meta', authority: 'context' };
  if (record.type === 'compacted') return { kind: 'compaction', authority: 'context' };
  if (record.type === 'event_msg') {
    if (payload.type === 'thread_rolled_back') {
      const valid = Number.isInteger(payload.num_turns) && payload.num_turns >= 0;
      return { kind: 'rollback', authority: 'context', numTurns: valid ? payload.num_turns : 0, invalid: !valid };
    }
    if (payload.type === 'user_message') {
      const turnId = typeof payload.turn_id === 'string' ? payload.turn_id : undefined;
      return { kind: 'owner', authority: 'owner', legacy: true, text: String(payload.message ?? ''), turnId };
    }
    if (payload.type === 'task_started') return { kind: 'turn_start', authority: 'context', turnId: payload.turn_id };
    return { kind: 'event', authority: 'context' };
  }
  if (record.type === 'response_item' && payload.type === 'message') {
    if (payload.role === 'user') {
      const kinds = userKinds(record);
      const turnId = payload.internal_chat_message_metadata_passthrough?.turn_id;
      if (kinds.includes('user.text')) {
        // All kinds are owner kinds: every text part is owner text. With context kinds beside user.text, only the parts
        // whose own kind is user.text are owner text, and only when the kinds align one to one with the parts.
        if (kinds.every((kind) => OWNER_KIND.has(kind))) return { kind: 'owner', authority: 'owner', text: contentText(payload.content), turnId };
        const parts = Array.isArray(payload.content) ? payload.content : [];
        if (kinds.length === parts.length) {
          return { kind: 'owner', authority: 'owner', text: contentText(parts.filter((_part, i) => kinds[i] === 'user.text')), turnId, mixed: true };
        }
        return { kind: 'user-unclassified', authority: 'context', text: contentText(payload.content) };
      }
      if (kinds.length === 1 && kinds[0] === 'unknown' && Array.isArray(payload.content) && payload.content.length === 1
        && HOOK_PROMPT.test(contentText(payload.content))) {
        return { kind: 'user-context', authority: 'context', text: contentText(payload.content) };
      }
      if (kinds.length > 0 && kinds.every((kind) => KNOWN_CONTEXT_KIND.test(kind))) {
        return { kind: 'user-context', authority: 'context', text: contentText(payload.content) };
      }
      return { kind: 'user-unclassified', authority: 'context', text: contentText(payload.content) };
    }
    if (payload.role === 'assistant') return { kind: 'assistant', authority: 'assistant', text: contentText(payload.content) };
    return { kind: 'message-context', authority: 'context', text: contentText(payload.content) };
  }
  return { kind: 'record', authority: 'context' };
}

// Loads one session. Records keep their line numbers as source identifiers. Rolled-back owner turns stay in
// the raw list with authority "rolled-back"; the raw records are historical, never current instructions.
function loadRecords(file) {
  return parseRecords(readFileSync(file), file);
}

// Parses the bytes of one session file; the same bytes always give the same records.
function parseRecords(raw, file) {
  const { records: parsed, limitations } = parseLines(readText(raw, file));
  const first = parsed[0];
  const meta = first && first.raw.type === 'session_meta' ? first.raw : undefined;
  const metaId = meta?.payload?.id ?? meta?.payload?.session_id;
  const sessionId = validSessionId(metaId) ? metaId : '';
  if (!meta) limitations.push('first record is not session_meta: session identity unproven');
  else if (sessionId === '') limitations.push('session_meta has no valid session id: session identity unproven');
  const payload = meta?.payload ?? {};
  if (payload.forked_from_id || payload.forkedFromId || payload.parent_thread_id || payload.parentThreadId) {
    limitations.push('fork ancestry: the parent prefix is not in this file');
  }
  const records = parsed.map((entry) => ({ id: `L${entry.line}`, line: entry.line, raw: entry.raw, ...classify(entry.raw) }));
  const unclassified = records.filter((r) => r.kind === 'user-unclassified').length;
  if (unclassified > 0) limitations.push(`${unclassified} user message(s) without a known owner classification: not owner authority`);
  for (const record of records) {
    if (record.kind === 'rollback' && record.invalid) limitations.push(`rollback ${record.id} has no valid num_turns: rolled-back turns unknown`);
  }
  // A modern owner record marks its turn. A legacy user_message is a duplicate of a modern owner in the same
  // turn; without a turn id it is a duplicate only when a modern owner has exactly the same text.
  const modernTurns = new Set(records.filter((r) => r.kind === 'owner' && !r.legacy && r.turnId).map((r) => r.turnId));
  const modernTexts = new Set(records.filter((r) => r.kind === 'owner' && !r.legacy).map((r) => r.text));
  let currentTurn;
  for (const record of records) {
    if (record.kind === 'turn_start') currentTurn = record.turnId;
    if (record.kind === 'owner' && record.legacy) {
      const turn = record.turnId ?? currentTurn;
      const duplicate = turn !== undefined ? modernTurns.has(turn) : modernTexts.has(record.text);
      record.authority = duplicate ? 'duplicate' : 'owner';
    }
  }
  // Native rollback drops the last N owner turns; the assistant text of a dropped turn loses authority too.
  const owners = [];
  const rolled = new Set();
  let currentOwner;
  for (const record of records) {
    if (record.kind === 'owner' && record.authority === 'owner') {
      owners.push(record);
      currentOwner = record;
    } else if (record.kind === 'assistant' && currentOwner) {
      record.ownerId = currentOwner.id;
    }
    if (record.kind === 'rollback') {
      for (let remaining = record.numTurns; remaining > 0 && owners.length > 0; remaining--) {
        const dropped = owners.pop();
        dropped.authority = 'rolled-back';
        rolled.add(dropped.id);
      }
      currentOwner = undefined;
    }
  }
  for (const record of records) {
    if (record.kind === 'assistant' && rolled.has(record.ownerId)) record.authority = 'rolled-back';
  }
  return { sessionId, records, limitations };
}

// Cursor "<recordIndex>:<characterOffset>": two non-negative integers, nothing else.
function parseCursor(from) {
  if (from === undefined) return { record: 0, offset: 0 };
  if (!/^\d+:\d+$/.test(from)) throw new Error(`invalid cursor "${from}"; pass the --from value printed by the previous page`);
  const [record, offset] = from.split(':').map(Number);
  return { record, offset };
}

// Pages raw records with a character budget and a cursor. Concatenating the parts of all pages gives each
// record's JSON exactly.
function page(loaded, from, budget) {
  if (!Number.isInteger(budget) || budget < 1 || budget > MAX_BUDGET) throw new Error(`budget must be an integer from 1 to ${MAX_BUDGET}`);
  const start = parseCursor(from);
  if (start.record > loaded.records.length) throw new Error(`cursor ${from} is beyond the end of the history`);
  const out = [];
  let used = 0;
  let index = start.record;
  let offset = start.offset;
  while (index < loaded.records.length && used < budget) {
    const record = loaded.records[index];
    const body = JSON.stringify(record.raw);
    if (offset > body.length) throw new Error(`cursor ${from} is beyond record ${record.id}`);
    if (offset === body.length) {
      index++;
      offset = 0;
      continue;
    }
    const take = Math.min(body.length - offset, budget - used);
    const authority = record.authority === 'rolled-back' ? 'rolled-back (historical, not current instruction)' : record.authority;
    out.push({ id: record.id, label: record.kind, authority, from: offset, text: body.slice(offset, offset + take) });
    used += take;
    offset += take;
    if (offset >= body.length) {
      index++;
      offset = 0;
    }
  }
  const next = index < loaded.records.length ? `${index}:${offset}` : undefined;
  return { parts: out, next };
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!['--session', '--path', '--from', '--budget'].includes(name)) throw new Error(`unknown argument "${name}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--') || value === '') throw new Error(`${name} needs a value`);
    if (flags[name] !== undefined) throw new Error(`${name} is given twice`);
    flags[name] = value;
    i++;
  }
  let budget = DEFAULT_BUDGET;
  if (flags['--budget'] !== undefined) {
    if (!/^[1-9]\d*$/.test(flags['--budget']) || Number(flags['--budget']) > MAX_BUDGET) throw new Error(`--budget must be an integer from 1 to ${MAX_BUDGET}`);
    budget = Number(flags['--budget']);
  }
  if (flags['--session'] !== undefined && !validSessionId(flags['--session'])) throw new Error(`invalid session id "${flags['--session']}"`);
  return { session: flags['--session'], path: flags['--path'], from: flags['--from'], budget };
}

function runCli(argv) {
  const args = parseArgs(argv);
  const explicitPath = args.path === undefined ? undefined : resolve(args.path);
  const session = args.session ?? (explicitPath ? undefined : process.env.CODEX_THREAD_ID || undefined);
  if (!explicitPath && !session) {
    process.stderr.write('history: CODEX_THREAD_ID is not set and no --session or --path is given\n');
    return 1;
  }
  if (args.from !== undefined && explicitPath === undefined) throw new Error('--from needs --path: pass the snapshot path printed by the previous page');
  const original = explicitPath ?? locate(session);
  // The first page freezes the source in a snapshot; later pages read that snapshot, which never changes.
  const source = args.from === undefined ? captureSource(original) : readSnapshot(original);
  const loaded = parseRecords(source.raw, original);
  if (args.session !== undefined && loaded.sessionId !== args.session) {
    throw new Error(`rollout ${original} belongs to session "${loaded.sessionId}", not ${args.session}`);
  }
  const result = page(loaded, args.from, args.budget);
  const lines = [`=== history ${source.snapshot} (session ${loaded.sessionId}, ${loaded.records.length} records, sha256 ${source.sha256}; original ${source.original})`];
  if (loaded.limitations.length > 0) lines.push(`coverage: incomplete: ${loaded.limitations.join('; ')}`);
  else lines.push('coverage: complete');
  for (const part of result.parts) {
    lines.push(`--- ${part.id} ${part.label} ${part.authority} from ${part.from}`);
    lines.push(part.text);
  }
  lines.push(result.next ? `next: --path "${source.snapshot}" --from ${result.next}` : 'end of history');
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

module.exports = { locate, loadRecords, parseRecords, captureSource, classify, page, validSessionId, codexHome };

if (require.main === module) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`history: ${error.message}\n`);
    process.exitCode = 1;
  }
}
