'use strict';

const { createHash } = require('node:crypto');
const { accessSync, closeSync, constants, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { delimiter, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const history = require('./session-history.cjs');

// Session decisions of the owner. The registry JSON is the only authority. The recorder (gpt-6.1-sol, low)
// sees one owner message at a time, with the assistant text right before it and the current registry.
// A full rebuild saves its candidate and cursor after every successful call and commits only when the
// whole source is covered.
const MODEL = 'gpt-6.1-sol';
const EFFORT = 'low';
const RECORDER_TIMEOUT_MS = 150000;
const DEFAULT_CHUNK_CHARS = 60000;
const OWNER_OVERHEAD_CHARS = 300;
const MIN_PART_CHARS = 100;
const MEMORY_LIMIT_BYTES = 16000;
const NO_HISTORY = 'no recorded or backfilled history';
const EARLIER_NOT_BACKFILLED = 'earlier history not backfilled; run decisions rebuild';
const STATUSES = ['active', 'replaced', 'cancelled', 'rolled-back'];
const FALLBACK_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
const PROMPT_FILE = join(__dirname, '..', 'prompts', 'decision-recorder.md');
const HISTORY_CLI = join(__dirname, 'session-history.cjs');
const OUTPUT_FIELDS = ['op', 'id', 'text', 'quote', 'confirmed', 'source', 'confirmedSource'];
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['changes'],
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: OUTPUT_FIELDS,
        properties: Object.fromEntries(OUTPUT_FIELDS.map((field) => [field, { type: 'string' }])),
      },
    },
  },
};

class DecisionError extends Error {}

const nested = () => process.env.SCOPE_FOCUS_DECISION_RECORDER === '1';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const isHighSurrogate = (code) => code >= 0xd800 && code <= 0xdbff;

function chunkChars() {
  const raw = process.env.SCOPE_FOCUS_DECISION_CHUNK_CHARS;
  if (raw === undefined || raw === '') return DEFAULT_CHUNK_CHARS;
  if (!/^[1-9]\d*$/.test(raw)) throw new DecisionError(`SCOPE_FOCUS_DECISION_CHUNK_CHARS must be a positive integer, got "${raw}"`);
  return Number(raw);
}

function stateDir() {
  return join(history.codexHome(), 'scope-focus-decisions');
}

function safeName(sessionId) {
  return sessionId.replace(/[^A-Za-z0-9_.-]/g, '_');
}

function registryFile(sessionId) {
  return join(stateDir(), `decisions-${safeName(sessionId)}.json`);
}

function progressFile(sessionId) {
  return join(stateDir(), `rebuild-${safeName(sessionId)}.progress.json`);
}

function emptyRegistry(sessionId) {
  return { sessionId, nextId: 1, decisions: [], processed: {}, coverage: { complete: false, limitations: [NO_HISTORY], backfilled: false } };
}

function isDecision(decision) {
  return decision !== null && typeof decision === 'object' && typeof decision.id === 'string' && /^D\d+$/.test(decision.id)
    && typeof decision.text === 'string' && typeof decision.quote === 'string' && typeof decision.source === 'string'
    && STATUSES.includes(decision.status);
}

function isRegistry(data, sessionId) {
  return data !== null && typeof data === 'object' && data.sessionId === sessionId
    && Number.isInteger(data.nextId) && data.nextId >= 1
    && Array.isArray(data.decisions) && data.decisions.every(isDecision)
    && data.processed !== null && typeof data.processed === 'object'
    && data.coverage !== null && typeof data.coverage === 'object'
    && typeof data.coverage.complete === 'boolean' && Array.isArray(data.coverage.limitations);
}

// Only a missing file means no registry. Any other read or parse problem is an error that leaves the file alone.
function loadRegistry(sessionId) {
  let text;
  try {
    text = readFileSync(registryFile(sessionId), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new DecisionError(`registry of session ${sessionId} cannot be read (${error.code || 'error'}); it was not changed`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DecisionError(`registry of session ${sessionId} is not valid JSON; it was not changed`);
  }
  if (!isRegistry(data, sessionId)) throw new DecisionError(`registry of session ${sessionId} has an unexpected shape; it was not changed`);
  return data;
}

function writeJsonAtomic(file, data) {
  mkdirSync(stateDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, file);
}

function saveRegistry(registry) {
  writeJsonAtomic(registryFile(registry.sessionId), registry);
}

function readProgress(sessionId) {
  let text;
  try {
    text = readFileSync(progressFile(sessionId), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new DecisionError(`rebuild progress of session ${sessionId} cannot be read (${error.code || 'error'}); nothing was changed`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DecisionError(`rebuild progress of session ${sessionId} is not valid JSON; nothing was changed`);
  }
  const valid = data !== null && typeof data === 'object' && typeof data.sourcePath === 'string' && typeof data.sourceSha256 === 'string'
    && data.cursor !== null && typeof data.cursor === 'object' && Number.isInteger(data.cursor.owner) && data.cursor.owner >= 0
    && Number.isInteger(data.cursor.offset) && data.cursor.offset >= 0 && isRegistry(data.candidate, sessionId);
  if (!valid) throw new DecisionError(`rebuild progress of session ${sessionId} has an unexpected shape; nothing was changed`);
  return data;
}

function removeFile(file) {
  try {
    unlinkSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

// The per-session lock covers the model calls and the commit. A lock whose process is gone is recovered;
// a live holder blocks the caller with a clear error.
function withLock(sessionId, fn) {
  mkdirSync(stateDir(), { recursive: true });
  const file = `${registryFile(sessionId)}.lock`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try {
      fd = openSync(file, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let holder = NaN;
      try {
        holder = Number(readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      let alive = false;
      try {
        process.kill(holder, 0);
        alive = true;
      } catch (probe) {
        alive = probe.code === 'EPERM';
      }
      if (alive) throw new DecisionError(`decisions of session ${sessionId} are busy (lock held by pid ${holder}); repeat later`);
      removeFile(file);
      continue;
    }
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    try {
      return fn();
    } finally {
      removeFile(file);
    }
  }
  throw new DecisionError(`decisions of session ${sessionId} are busy; repeat later`);
}

// CODEX_EXECUTABLE is an explicit native executable. On PATH only the native binary is used: an extensionless
// npm shim is not run by spawnSync on Windows, so there the name is codex.exe.
function resolveCodex() {
  if (process.env.CODEX_EXECUTABLE) return process.env.CODEX_EXECUTABLE;
  const names = process.platform === 'win32' ? ['codex.exe'] : ['codex'];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (dir === '') continue;
    for (const name of names) {
      const candidate = join(dir, name);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep looking on PATH.
      }
    }
  }
  if (existsSync(FALLBACK_CODEX)) return FALLBACK_CODEX;
  throw new DecisionError('codex executable not found on PATH (codex, or codex.exe on Windows) or at the documented macOS fallback; set CODEX_EXECUTABLE');
}

// One recorder call. Its error text carries the exit status only: recorder output may hold transcript text.
// The temporary directory stays on disk as evidence.
function callRecorder(input) {
  const dir = mkdtempSync(join(tmpdir(), 'scope-focus-recorder-'));
  const cwd = join(dir, 'cwd');
  mkdirSync(cwd);
  const schemaFile = join(dir, 'schema.json');
  const outFile = join(dir, 'answer.json');
  writeFileSync(schemaFile, JSON.stringify(OUTPUT_SCHEMA));
  const args = [
    'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--disable', 'hooks', '--disable', 'plugins',
    '-m', MODEL, '-c', `model_reasoning_effort="${EFFORT}"`,
    '-c', `model_instructions_file=${JSON.stringify(PROMPT_FILE)}`,
    '--output-schema', schemaFile, '--output-last-message', outFile, '-',
  ];
  const run = spawnSync(resolveCodex(), args, {
    input,
    cwd,
    env: { ...process.env, SCOPE_FOCUS_DECISION_RECORDER: '1' },
    encoding: 'utf8',
    timeout: RECORDER_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error && run.error.code === 'ETIMEDOUT') throw new DecisionError(`recorder timed out after ${RECORDER_TIMEOUT_MS / 1000} s`);
  if (run.error) throw new DecisionError(`recorder did not start: ${run.error.code || 'error'}`);
  if (run.status !== 0) throw new DecisionError(`recorder failed (exit ${run.status ?? run.signal})`);
  try {
    return JSON.parse(readFileSync(outFile, 'utf8'));
  } catch {
    throw new DecisionError('recorder returned no readable answer');
  }
}

// Validates the whole answer against one owner message and the assistant message right before it.
// Changes are checked in order against the active ids that remain at that point, so a replace or cancel
// may name only a decision still active when it applies. Any invalid change rejects the whole answer.
function validateChanges(answer, { owner, context = [] }, registry) {
  if (!answer || typeof answer !== 'object' || !Array.isArray(answer.changes)) throw new DecisionError('recorder answer has no changes array');
  const active = new Set(registry.decisions.filter((d) => d.status === 'active').map((d) => d.id));
  for (const change of answer.changes) {
    for (const field of OUTPUT_FIELDS) {
      if (typeof change?.[field] !== 'string') throw new DecisionError(`recorder change lacks string field ${field}`);
    }
    if (!['add', 'replace', 'cancel'].includes(change.op)) throw new DecisionError(`recorder change has unknown op "${change.op}"`);
    if (change.source !== owner.id) throw new DecisionError(`recorder source ${change.source} is not the owner message ${owner.id} under check`);
    if (change.quote === '' || !owner.text.includes(change.quote)) throw new DecisionError(`recorder quote is not an exact part of ${change.source}`);
    if (change.confirmed === '') {
      if (change.confirmedSource !== '') throw new DecisionError('recorder confirmedSource without confirmed');
    } else {
      // Only a preceding assistant record, named by its own identifier, can be the proposal.
      const proposal = context.find((record) => record.id === change.confirmedSource);
      if (!proposal || !proposal.text.includes(change.confirmed)) {
        throw new DecisionError(`recorder confirmed text is not an exact part of an assistant message right before ${owner.id}`);
      }
    }
    if (change.op === 'add') {
      if (change.id !== '' || change.text.trim() === '') throw new DecisionError('add needs empty id and text');
    } else if (change.op === 'replace') {
      if (!active.has(change.id) || change.text.trim() === '') throw new DecisionError(`replace needs an active id, got "${change.id}"`);
      active.delete(change.id);
    } else {
      if (!active.has(change.id) || change.text !== '') throw new DecisionError(`cancel needs an active id and empty text, got "${change.id}"`);
      active.delete(change.id);
    }
  }
  return answer.changes;
}

// Commits validated changes to a registry copy in order; ids are monotonic and never reused.
function applyChanges(registry, changes, provenance) {
  for (const change of changes) {
    const base = { quote: change.quote, source: change.source, confirmed: change.confirmed, confirmedSource: change.confirmedSource, provenance };
    if (change.op === 'add') {
      registry.decisions.push({ id: `D${registry.nextId++}`, text: change.text, ...base, status: 'active' });
    } else if (change.op === 'replace') {
      const old = registry.decisions.find((d) => d.id === change.id);
      const id = `D${registry.nextId++}`;
      old.status = 'replaced';
      old.replacedBy = id;
      registry.decisions.push({ id, text: change.text, ...base, status: 'active', replaces: old.id });
    } else {
      const old = registry.decisions.find((d) => d.id === change.id);
      old.status = 'cancelled';
      old.cancelledBy = { source: change.source, quote: change.quote, turnId: provenance.turnId };
    }
  }
  return registry;
}

// A source is the record it names; a live decision whose record is not in the transcript yet is matched by its turn.
function sourceRecord(records, source, turnId) {
  return records.find((r) => r.id === source)
    ?? (turnId === undefined ? undefined : records.find((r) => r.kind === 'owner' && r.authority !== 'duplicate' && r.turnId === turnId));
}

// The rollback that removed a source turn, or undefined while that turn still stands.
function rollbackOf(records, source, turnId) {
  const record = sourceRecord(records, source, turnId);
  if (!record || record.authority !== 'rolled-back') return undefined;
  const rollback = records.find((r) => r.kind === 'rollback' && r.line > record.line);
  return rollback ? rollback.id : 'transcript';
}

// Statuses from the transcript, without a model call. A decision whose own source turn was rolled back is
// rolled-back. Otherwise it is replaced or cancelled only while the change that did so still stands; a rolled-back
// change releases the decision it replaced or cancelled. The links stay in the registry as recorded.
function reconcileStatuses(registry, records) {
  const byId = new Map(registry.decisions.map((d) => [d.id, d]));
  for (const decision of registry.decisions) {
    const rolledBy = rollbackOf(records, decision.source, decision.provenance?.turnId);
    if (rolledBy !== undefined) {
      decision.status = 'rolled-back';
      decision.rolledBackBy = rolledBy;
      continue;
    }
    const replacer = decision.replacedBy === undefined ? undefined : byId.get(decision.replacedBy);
    const replaced = replacer !== undefined && rollbackOf(records, replacer.source, replacer.provenance?.turnId) === undefined;
    const cancelled = decision.cancelledBy !== undefined && rollbackOf(records, decision.cancelledBy.source, decision.cancelledBy.turnId) === undefined;
    decision.status = replaced ? 'replaced' : cancelled ? 'cancelled' : 'active';
  }
  return registry;
}

function promptKey(turnId, prompt) {
  return sha256(`${turnId}\u0000${prompt}`);
}

// Owner messages to replay, oldest first. Each carries the assistant text since the previous owner record,
// so a proposal is the one right before its owner message, never the one after it.
function replayUnits(loaded) {
  const units = [];
  let assistant = [];
  for (const record of loaded.records) {
    if (record.kind === 'owner') {
      if (record.authority === 'owner') {
        const context = assistant.map((record) => ({ id: record.id, text: record.text }));
        units.push({ owner: { id: record.id, text: record.text }, context });
      }
      assistant = [];
    } else if (record.kind === 'assistant' && record.authority === 'assistant' && record.text !== '') {
      assistant.push(record);
    }
  }
  return units;
}

// Authoritative assistant text between the last owner record before `index` and that owner record.
function assistantBefore(records, index) {
  const group = [];
  for (let i = index - 1; i >= 0; i--) {
    const record = records[i];
    if (record.kind === 'owner') break;
    if (record.kind === 'assistant' && record.authority === 'assistant' && record.text !== '') group.unshift(record);
  }
  return group.map((record) => ({ id: record.id, text: record.text }));
}

// The recorder input: one JSON object. The registry holds the active decisions; each preceding assistant message
// keeps its own identifier; the owner message is the whole text or one part of it.
function renderInput(registry, { mode, owner, context }) {
  const active = registry.decisions.filter((d) => d.status === 'active').map((d) => ({ id: d.id, text: d.text, quote: d.quote, confirmed: d.confirmed, source: d.source, confirmedSource: d.confirmedSource }));
  const currentOwner = owner.part === undefined ? { id: owner.id, text: owner.text } : { id: owner.id, text: owner.text, part: owner.part };
  return JSON.stringify({ mode, registry: active, precedingAssistant: context, currentOwner }, null, 2);
}

// The room left for owner text in one call: the whole input stays within the chunk bound.
function ownerRoom(registry, context, limit) {
  const base = renderInput(registry, { mode: 'history', owner: { id: 'owner', text: '' }, context }).length;
  const room = limit - base - OWNER_OVERHEAD_CHARS;
  if (room < MIN_PART_CHARS) {
    throw new DecisionError(`registry and preceding proposal need ${base} characters; raise SCOPE_FOCUS_DECISION_CHUNK_CHARS above ${base + OWNER_OVERHEAD_CHARS + MIN_PART_CHARS}`);
  }
  return room;
}

// The next part of an owner text whose whole input stays within `limit`. JSON escapes count toward the bound, so
// the room shrinks by the excess until the input fits; the parts stay contiguous and lossless.
function ownerPart(registry, unit, start, limit) {
  const text = unit.owner.text;
  let room = ownerRoom(registry, unit.context, limit);
  for (;;) {
    const part = nextPart(text, start, room);
    const owner = { id: unit.owner.id, text: part.text, part: `${part.start}-${part.end} of ${text.length}` };
    const size = renderInput(registry, { mode: 'history', owner, context: unit.context }).length;
    if (size <= limit) return { part, owner };
    room -= size - limit;
    if (room < MIN_PART_CHARS) throw new DecisionError('an owner message part does not fit the chunk bound; raise SCOPE_FOCUS_DECISION_CHUNK_CHARS');
  }
}

// The next lossless part of an owner text from `start`: at most `limit` characters, cut at a line break or
// space near the limit when one exists, and never inside a surrogate pair.
function nextPart(text, start, limit) {
  let end = Math.min(text.length, start + limit);
  if (end < text.length) {
    const window = text.slice(start, end);
    const newline = window.lastIndexOf('\n');
    const cut = newline > limit / 2 ? newline : window.lastIndexOf(' ');
    if (cut > limit / 2) end = start + cut + 1;
    else if (isHighSurrogate(text.charCodeAt(end - 1))) end -= 1;
  }
  return { start, end, text: text.slice(start, end) };
}

// Records the decisions of one live owner prompt. The transcript, when it is readable, gives the owner's
// record and the assistant text right before it; a prompt not flushed yet uses the last assistant text.
function updatePrompt(input) {
  if (nested()) return { status: 'skipped', reason: 'nested recorder' };
  const sessionId = input.sessionId;
  if (!history.validSessionId(sessionId)) throw new DecisionError(`invalid session id "${sessionId}"`);
  const prompt = String(input.prompt ?? '');
  const turnId = String(input.turnId ?? '');
  if (prompt.trim() === '') return { status: 'skipped', reason: 'empty prompt' };
  return withLock(sessionId, () => {
    let registry = loadRegistry(sessionId);
    const key = promptKey(turnId, prompt);
    if (registry?.processed?.[key]) return { status: 'duplicate', registry };

    const limitations = [];
    let loaded;
    let transcriptPath = null;
    if (typeof input.transcriptPath !== 'string') {
      limitations.push('no transcript path: earlier history not read');
    } else if (!existsSync(input.transcriptPath)) {
      limitations.push(`transcript file missing (${input.transcriptPath}): earlier history not read`);
    } else {
      loaded = history.loadRecords(input.transcriptPath);
      if (loaded.sessionId !== sessionId) throw new DecisionError(`transcript belongs to session "${loaded.sessionId}", not ${sessionId}; registry unchanged`);
      transcriptPath = input.transcriptPath;
    }

    const records = loaded ? loaded.records : [];
    const index = records.findIndex((r) => r.kind === 'owner' && r.authority === 'owner' && r.turnId === turnId && r.text === prompt);
    const owner = index >= 0 ? { id: records[index].id, text: prompt } : { id: `turn-${safeName(turnId) || 'none'}`, text: prompt };
    const context = loaded ? assistantBefore(records, index >= 0 ? index : records.length) : [];
    const provenance = { kind: 'live', turnId, promptSha256: sha256(prompt), transcriptPath };

    if (registry === undefined) {
      const earlierOwners = records.slice(0, index >= 0 ? index : records.length).some((r) => r.kind === 'owner' && r.authority === 'owner');
      const earlier = !loaded || earlierOwners;
      const complete = !earlier && limitations.length === 0 && (loaded?.limitations.length ?? 0) === 0;
      registry = emptyRegistry(sessionId);
      registry.coverage = {
        complete,
        limitations: complete ? [] : [...limitations, ...(earlier ? [EARLIER_NOT_BACKFILLED] : []), ...(loaded?.limitations ?? [])],
        backfilled: complete,
      };
    } else {
      // Gaps of this call, and of the transcript it read, are merged into the existing coverage.
      const fresh = [...limitations, ...(loaded?.limitations ?? [])];
      if (fresh.length > 0) {
        const merged = [...registry.coverage.limitations, ...fresh.filter((l) => !registry.coverage.limitations.includes(l))];
        registry.coverage = { ...registry.coverage, complete: false, limitations: merged };
      }
    }

    // Statuses follow the transcript's rollbacks; nothing is inferred from a prompt that is not in it yet.
    if (loaded) reconcileStatuses(registry, records);

    const answer = callRecorder(renderInput(registry, { mode: 'live-turn', owner: { id: owner.id, text: prompt }, context }));
    const changes = validateChanges(answer, { owner, context }, registry);
    applyChanges(registry, changes, provenance);
    registry.processed[key] = { at: new Date().toISOString(), changes: changes.length };
    saveRegistry(registry);
    return { status: 'recorded', registry, changes: changes.length };
  });
}

// Replays the whole source history: one owner message per call, in source order, against the candidate
// registry, which already holds every earlier change. A progress file holds the candidate and the cursor
// after each successful call, so an interrupted replay of the same source resumes. The registry is committed
// only when the candidate covers the whole source, or when no complete registry exists yet.
function rebuild({ sessionId, path }) {
  if (nested()) throw new DecisionError('rebuild is not available inside the recorder');
  const limit = chunkChars();
  const file = path ? resolve(path) : history.locate(sessionId);
  const captured = history.captureSource(file);
  const loaded = history.parseRecords(captured.raw, file);
  if (sessionId !== undefined && loaded.sessionId !== sessionId) {
    throw new DecisionError(`rollout ${file} belongs to session "${loaded.sessionId}", not ${sessionId}; registry unchanged`);
  }
  const sid = loaded.sessionId;
  if (!history.validSessionId(sid)) throw new DecisionError('source session identity is unproven; registry unchanged');
  const source = { path: file, snapshot: captured.snapshot, sha256: captured.sha256, records: loaded.records.length };
  return withLock(sid, () => {
    const units = replayUnits(loaded);
    const prior = readProgress(sid);
    let candidate = emptyRegistry(sid);
    let cursor = { owner: 0, offset: 0 };
    const resumed = prior !== undefined && prior.sourceSha256 === source.sha256 && prior.sourcePath === file;
    const discarded = prior !== undefined && !resumed;
    if (resumed) {
      candidate = prior.candidate;
      cursor = prior.cursor;
    }
    const provenance = { kind: 'rebuild', path: file, snapshot: source.snapshot, sha256: source.sha256 };
    while (cursor.owner < units.length) {
      const unit = units[cursor.owner];
      const text = unit.owner.text;
      if (text.trim() === '' || cursor.offset >= text.length) {
        cursor = { owner: cursor.owner + 1, offset: 0 };
        continue;
      }
      const { part, owner } = ownerPart(candidate, unit, cursor.offset, limit);
      const answer = callRecorder(renderInput(candidate, { mode: 'history', owner, context: unit.context }));
      applyChanges(candidate, validateChanges(answer, { owner: unit.owner, context: unit.context }, candidate), provenance);
      cursor = part.end >= text.length ? { owner: cursor.owner + 1, offset: 0 } : { owner: cursor.owner, offset: part.end };
      writeJsonAtomic(progressFile(sid), { sourcePath: file, sourceSha256: source.sha256, snapshotPath: source.snapshot, cursor, candidate });
    }
    const limitations = [...loaded.limitations];
    if (units.length === 0) limitations.push('no owner messages in the source history');
    candidate.coverage = { complete: limitations.length === 0, limitations, backfilled: true, source };
    const existing = loadRegistry(sid);
    if (!candidate.coverage.complete && existing !== undefined) {
      // A usable registry is kept for an incomplete source: its decisions stay and the source gap is recorded.
      const gaps = [...existing.coverage.limitations, ...limitations.filter((l) => !existing.coverage.limitations.includes(l))];
      const kept = { ...existing, coverage: { ...existing.coverage, complete: false, limitations: gaps } };
      saveRegistry(kept);
      return { registry: kept, candidate, committed: false, resumed, discarded };
    }
    saveRegistry(candidate);
    removeFile(progressFile(sid));
    return { registry: candidate, candidate, committed: true, resumed, discarded };
  });
}

function statusLabel(decision) {
  if (decision.status === 'replaced') return `replaced by ${decision.replacedBy}`;
  if (decision.status === 'cancelled') return 'cancelled';
  if (decision.status === 'rolled-back') return `rolled back (${decision.rolledBackBy})`;
  return 'active';
}

function decisionLines(d) {
  const out = [`- ${d.id} [${statusLabel(d)}]${d.replaces ? ` replaces ${d.replaces}` : ''}: ${d.text}`, `  Quote: «${d.quote}» (source ${d.source})`];
  if (d.confirmed) out.push(`  Approved proposal: «${d.confirmed}» (source ${d.confirmedSource})`);
  return out;
}

// The readable Markdown of a registry, with its sources and coverage.
function renderMarkdown(registry) {
  const lines = [`# Decisions of session ${registry.sessionId}`, ''];
  const coverage = registry.coverage;
  lines.push(coverage.complete ? 'Coverage: complete.' : `Coverage: incomplete. ${coverage.limitations.join('; ')}`);
  if (coverage.source) {
    lines.push(`Source snapshot: ${coverage.source.snapshot} (original ${coverage.source.path}, sha256 ${coverage.source.sha256}, ${coverage.source.records} records).`);
    lines.push(`History pages: node "${HISTORY_CLI}" --path "${coverage.source.snapshot}"`);
  }
  lines.push('Active decisions apply only within the original task scope of each one. Replaced, cancelled and rolled-back entries are not binding.');
  lines.push('', '## Active decisions', '');
  const active = registry.decisions.filter((d) => d.status === 'active');
  if (active.length === 0) lines.push('None.');
  for (const d of active) lines.push(...decisionLines(d));
  const inactive = registry.decisions.filter((d) => d.status !== 'active');
  if (inactive.length > 0) {
    lines.push('', '## Replaced, cancelled and rolled back (not binding)', '');
    for (const d of inactive) lines.push(...decisionLines(d));
  }
  return `${lines.join('\n')}\n`;
}

function renderMissing(sessionId) {
  return `# Decisions of session ${sessionId}\n\nNo decisions are recorded for this session: no recorded or backfilled history.\n`;
}

// Text for SessionStart and UserPromptSubmit: the registry inline when it fits, else a pointer. The limit is in bytes.
function memoryText(sessionId) {
  const registry = loadRegistry(sessionId);
  if (!registry || registry.decisions.length === 0) return '';
  const markdown = renderMarkdown(registry);
  const bytes = Buffer.byteLength(markdown, 'utf8');
  if (bytes <= MEMORY_LIMIT_BYTES) return markdown;
  return `Decisions registry is too large to embed (${bytes} bytes). Read it in full before work: node "${__filename}" show --session ${sessionId}\nFile: ${registryFile(sessionId)}`;
}

function cliPath() {
  return __filename;
}

// Strict flags: show and rebuild only, --session and --path with one value each, no repeats.
function parseArgs(argv) {
  const command = argv[0];
  if (command !== 'show' && command !== 'rebuild') throw new DecisionError('use show or rebuild; pass --session ID or --path FILE');
  const flags = {};
  for (let i = 1; i < argv.length; i++) {
    const name = argv[i];
    if (name !== '--session' && name !== '--path') throw new DecisionError(`unknown argument "${name}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--') || value === '') throw new DecisionError(`${name} needs a value`);
    if (flags[name] !== undefined) throw new DecisionError(`${name} is given twice`);
    flags[name] = value;
    i++;
  }
  if (command === 'show' && flags['--path'] !== undefined) throw new DecisionError('show reads the registry by session; use --session ID');
  return { command, explicit: flags['--session'], path: flags['--path'] };
}

function runCli(argv) {
  const { command, explicit, path } = parseArgs(argv);
  if (explicit !== undefined && !history.validSessionId(explicit)) throw new DecisionError(`invalid session id "${explicit}"`);
  const envSession = path === undefined ? process.env.CODEX_THREAD_ID || undefined : undefined;
  const session = explicit ?? envSession;
  if (command === 'show') {
    if (!history.validSessionId(session)) throw new DecisionError('no session: CODEX_THREAD_ID is not set; pass --session ID');
    const registry = loadRegistry(session);
    process.stdout.write(registry === undefined ? renderMissing(session) : renderMarkdown(registry));
    return 0;
  }
  if (path === undefined && !history.validSessionId(session)) throw new DecisionError('no session: CODEX_THREAD_ID is not set; pass --session ID or --path FILE');
  const result = rebuild({ sessionId: explicit ?? session, path: path === undefined ? undefined : resolve(path) });
  const sid = result.candidate.sessionId;
  const source = result.candidate.coverage.source;
  if (source) process.stdout.write(`${result.committed ? 'source snapshot' : 'candidate source snapshot'} ${source.snapshot}; history: node "${HISTORY_CLI}" --path "${source.snapshot}"\n`);
  const coverage = result.candidate.coverage.complete ? 'complete' : 'incomplete';
  const state = result.committed ? 'registry written' : `registry kept (source coverage incomplete); candidate saved at ${progressFile(sid)}`;
  const notes = [result.resumed ? 'resumed from saved progress' : '', result.discarded ? 'previous candidate discarded (source changed)' : ''].filter((n) => n !== '');
  process.stdout.write(`rebuilt ${result.candidate.decisions.length} decisions; coverage ${coverage}; ${state}${notes.length ? `; ${notes.join('; ')}` : ''}\n`);
  return 0;
}

module.exports = { updatePrompt, rebuild, memoryText, renderMarkdown, loadRegistry, validateChanges, applyChanges, cliPath, resolveCodex, OUTPUT_SCHEMA };

if (require.main === module) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`decisions: ${error.message}\n`);
    process.exitCode = 1;
  }
}
