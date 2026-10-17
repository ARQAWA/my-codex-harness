import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline by default: a fake `codex exec` checks mechanics (argv, hooks off, cwd, validation, one owner per call,
// failure and resume, source change, incomplete source, live provenance). `--live` (explicit, never default) runs the
// real recorder and a real restore by Main on the same fixture rollout, in temp homes that get copies of auth and
// config only. Temp directories stay on disk as evidence; nothing here removes them.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const TOOLS = path.join(root, 'plugins', 'scope-focus', 'tools');
const decisionsCli = path.join(TOOLS, 'decisions.cjs');
const historyCli = path.join(TOOLS, 'session-history.cjs');
const history = require(historyCli);
const DECISIONS = require(decisionsCli);
const hookTodo = path.join(root, 'plugins', 'scope-focus', 'hooks', 'todo.cjs');
const hookCommunication = path.join(root, 'plugins', 'scope-focus', 'hooks', 'communication.cjs');
const FIX = path.join(root, 'tests', 'fixtures', 'session-decisions');
const fakeCodex = path.join(FIX, 'fake-codex.mjs');
// Node-only preload: a spawnSync of the fake codex path runs fake-codex.mjs with this Node (no shell script).
const SHIM = path.join(FIX, 'spawn-fake-codex.cjs');
const LIVE = process.argv.includes('--live');
// TEST ONLY, with --live: `--resume-home PATH` reuses the registry of an earlier live recorder run instead of calling the recorder.
const RESUME_FLAG = process.argv.indexOf('--resume-home');
const RESUME_HOME = RESUME_FLAG < 0 ? '' : (process.argv[RESUME_FLAG + 1] ?? '');
if (RESUME_FLAG >= 0 && (!LIVE || RESUME_HOME === '' || RESUME_HOME.startsWith('--'))) {
  console.error('--resume-home PATH is only valid with --live and needs a path.');
  process.exit(1);
}
// TEST ONLY, with --live-equivalence: `--baseline-home PATH` is the home of an earlier successful live run of this fixture
// (its recorder registry and Main todo). The equivalence check validates and reads it; it never re-runs it.
const EQUIVALENCE = process.argv.includes('--live-equivalence');
const BASELINE_FLAG = process.argv.indexOf('--baseline-home');
const BASELINE_HOME = BASELINE_FLAG < 0 ? '' : (process.argv[BASELINE_FLAG + 1] ?? '');
if (EQUIVALENCE && (LIVE || RESUME_FLAG >= 0 || BASELINE_HOME === '' || BASELINE_HOME.startsWith('--'))) {
  console.error('--live-equivalence needs --baseline-home PATH and runs without --live or --resume-home.');
  process.exit(1);
}
if (BASELINE_FLAG >= 0 && !EQUIVALENCE) {
  console.error('--baseline-home PATH is only valid with --live-equivalence.');
  process.exit(1);
}
const SID = 'fixture-session-1';
const failures = [];

function check(name, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(name);
    console.log(`FAIL: ${name}: ${error.message}`);
  }
}

// Offline checks run only without --live and --live-equivalence; a live run does its own real checks and nothing else.
function offline(name, fn) {
  if (!LIVE && !EQUIVALENCE) check(name, fn);
}

// Keys and bearer tokens never go into the evidence files.
const redact = (text) => text.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-REDACTED').replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer REDACTED');

// A fresh CODEX_HOME with the fixture rollout and a fake `codex` command (run through the preload shim).
function makeHome(rulesFile = path.join(FIX, 'rules.json')) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sd test '));
  const day = path.join(home, 'sessions', '2026', '10', '17');
  fs.mkdirSync(day, { recursive: true });
  const rollout = path.join(day, `rollout-2026-10-17T10-00-00-${SID}.jsonl`);
  fs.copyFileSync(path.join(FIX, 'rollout.jsonl'), rollout);
  const bin = path.join(home, 'codex');
  return { home, bin, log: path.join(home, 'calls.jsonl'), rules: rulesFile, rollout };
}

// The environment of the test process without the fake and chunk switches, which each check sets itself.
function baseEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('FAKE_CODEX_') || key.startsWith('SCOPE_FOCUS_')) delete env[key];
  }
  return env;
}

function envFor(home, extra = {}) {
  return {
    ...baseEnv(),
    CODEX_HOME: home.home,
    CODEX_EXECUTABLE: home.bin,
    FAKE_CODEX_LOG: home.log,
    FAKE_CODEX_RULES: home.rules,
    FAKE_CODEX_SCRIPT: fakeCodex,
    ...extra,
  };
}

function runNode(args, home, extra = {}) {
  return spawnSync(process.execPath, ['--require', SHIM, ...args], { encoding: 'utf8', env: envFor(home, extra) });
}

function evalNode(code, home) {
  return spawnSync(process.execPath, ['--require', SHIM, '-e', code], { encoding: 'utf8', env: envFor(home) });
}

function rebuild(home, extra = {}) {
  return runNode([decisionsCli, 'rebuild', '--session', SID], home, extra);
}

function calls(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
}

const callLog = (home) => calls(home.log);
const stateDir = (home) => path.join(home.home, 'scope-focus-decisions');
const registryFile = (home, sid = SID) => path.join(stateDir(home), `decisions-${sid}.json`);
const progressFile = (home, sid = SID) => path.join(stateDir(home), `rebuild-${sid}.progress.json`);
const registryBytes = (home) => fs.readFileSync(registryFile(home), 'utf8');
const registryOf = (home) => JSON.parse(registryBytes(home));
const activeTexts = (reg) => reg.decisions.filter((d) => d.status === 'active').map((d) => [d.id, d.text]);
const inputOf = (call) => JSON.parse(call.stdin);
const ownersIn = (call) => [inputOf(call).currentOwner.id];

// The registry without the random path of the source snapshot, which each rebuild creates anew: the coverage source
// and the provenance of each decision name it.
const withoutSnapshot = (registry) => {
  const copy = structuredClone(registry);
  if (copy.coverage.source) delete copy.coverage.source.snapshot;
  for (const decision of copy.decisions) {
    if (decision.provenance) delete decision.provenance.snapshot;
  }
  return copy;
};

// A rollout written for one check; each object is one JSONL record.
function writeRollout(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd rollout '));
  const file = path.join(dir, `rollout-2026-10-17T10-00-00-${SID}.jsonl`);
  fs.writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  return file;
}
const turn = (turnId) => ({ type: 'event_msg', payload: { type: 'task_started', turn_id: turnId } });
const userMsg = (text, turnId, kinds, extra = []) => ({
  type: 'response_item',
  payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }, ...extra], internal_chat_message_metadata_passthrough: { turn_id: turnId, content_item_kinds: kinds } },
});
const legacyMsg = (message, turnId) => ({ type: 'event_msg', payload: { type: 'user_message', message, ...(turnId ? { turn_id: turnId } : {}) } });

let base;
offline('rebuild: one owner per recorder call, recorder argv, no injected or rolled-back text', () => {
  base = makeHome();
  const run = rebuild(base);
  assert.equal(run.status, 0, run.stderr);
  const made = callLog(base);
  assert.deepEqual(made.map((c) => ownersIn(c)), [['L3'], ['L5'], ['L7'], ['L9'], ['L13'], ['L19'], ['L21']]);
  for (const call of made) {
    const argv = call.argv;
    const pair = (flag, value) => argv.some((arg, i) => arg === flag && argv[i + 1] === value);
    assert.ok(pair('-m', 'gpt-6.1-sol'), argv.join(' '));
    assert.ok(argv.includes('model_reasoning_effort="low"'), argv.join(' '));
    assert.ok(pair('--disable', 'hooks') && pair('--disable', 'plugins'), argv.join(' '));
    assert.ok(pair('--sandbox', 'read-only') && argv.includes('--ephemeral'), argv.join(' '));
    assert.ok(argv.includes('--output-schema') && argv.includes('--output-last-message') && argv.at(-1) === '-', argv.join(' '));
    assert.equal(call.recorder, '1', 'nested guard variable is set for the child');
    assert.ok(!call.cwd.startsWith(root), `cwd is outside the repository: ${call.cwd}`);
    assert.ok(!call.stdin.includes('Always add CSV'), 'environment injection is not sent as owner text');
    assert.ok(!call.stdin.includes('ZZZ'), 'compaction replacement_history is not sent as owner text');
    assert.ok(!call.stdin.includes('верни Markdown'), 'rolled-back owner turn is not sent as authority');
    assert.ok(!call.stdin.includes('Вернуть Markdown?'), 'assistant text of the rolled-back turn is not sent');
  }
  // Each owner comes with the assistant messages right before it, each under its own id, never the text after it.
  const ids = (call) => inputOf(call).precedingAssistant.map((record) => record.id);
  assert.ok(ids(made[1]).includes('L4'), 'L5 gets its proposal L4');
  assert.deepEqual(ids(made[4]), ['L12'], 'L13 gets L12 only');
  assert.deepEqual(ids(made[5]), ['L14', 'L17'], 'L19 gets its two assistant messages, each under its own id');
  assert.ok(made[5].stdin.includes('Принято:'), 'L19 gets the proposal text');
  assert.ok(!made[5].stdin.includes('Хорошо, gamma.md снимаю.'), 'L19 does not get the assistant reply after it');
});

offline('rebuild: registry matches the offline oracle', () => {
  const reg = registryOf(base);
  assert.deepEqual(activeTexts(reg), [['D3', 'Формат отчётов: JSON.'], ['D4', 'Сделай alpha.md в папке results/.'], ['D5', 'Сделай beta.md в папке results/.']]);
  const byId = Object.fromEntries(reg.decisions.map((d) => [d.id, d]));
  assert.equal(byId.D1.status, 'cancelled');
  assert.equal(byId.D1.cancelledBy.source, 'L21');
  assert.equal(byId.D2.status, 'replaced');
  assert.equal(byId.D2.replacedBy, 'D3');
  assert.equal(byId.D2.source, 'L5');
  assert.equal(byId.D2.confirmed, '1a) Markdown');
  assert.equal(byId.D2.confirmedSource, 'L4');
  assert.equal(byId.D3.replaces, 'D2');
  assert.equal(byId.D3.source, 'L7');
  assert.equal(byId.D4.source, 'L13');
  assert.equal(byId.D6.status, 'cancelled');
  assert.equal(byId.D6.cancelledBy.source, 'L19');
  assert.equal(reg.nextId, 7);
  assert.equal(reg.coverage.complete, true);
  assert.deepEqual(reg.coverage.limitations, []);
  const shown = runNode([decisionsCli, 'show', '--session', SID], base);
  assert.equal(shown.status, 0, shown.stderr);
  assert.ok(shown.stdout.includes('Coverage: complete.'), shown.stdout);
  assert.ok(shown.stdout.includes('Approved proposal: «1a) Markdown» (source L4)'), shown.stdout);
  assert.ok(shown.stdout.includes('Replaced, cancelled and rolled back (not binding)'), shown.stdout);
});

offline('rebuild: a repeated run gives the same registry', () => {
  const first = withoutSnapshot(registryOf(base));
  const again = rebuild(base);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(withoutSnapshot(registryOf(base)), first);
});

offline('history: owner authority, rolled-back turn labelled, compactions kept as raw data', () => {
  const loaded = history.loadRecords(base.rollout);
  assert.equal(loaded.sessionId, SID);
  assert.deepEqual(loaded.records.filter((r) => r.authority === 'owner').map((r) => r.id), ['L3', 'L5', 'L7', 'L9', 'L13', 'L19', 'L21']);
  assert.equal(loaded.records.find((r) => r.id === 'L23').authority, 'rolled-back');
  assert.equal(loaded.records.find((r) => r.id === 'L24').authority, 'rolled-back');
  assert.equal(loaded.records.find((r) => r.id === 'L22').authority, 'assistant');
  assert.equal(loaded.records.find((r) => r.id === 'L10').authority, 'context');
  assert.equal(loaded.records.find((r) => r.id === 'L11').kind, 'compaction');
  assert.equal(loaded.records.find((r) => r.id === 'L18').kind, 'compaction');
  assert.equal(loaded.records.find((r) => r.id === 'L16').authority, 'context');
  assert.deepEqual(loaded.limitations, []);
});

offline('history: pages cover all source text with cursors; bad cursors are refused', () => {
  const loaded = history.loadRecords(base.rollout);
  const seen = new Map(loaded.records.map((r) => [r.id, '']));
  let from;
  let guard = 0;
  do {
    const page = history.page(loaded, from, 37);
    for (const part of page.parts) seen.set(part.id, seen.get(part.id) + part.text);
    from = page.next;
    assert.ok(++guard < 1000, 'pagination terminates');
  } while (from);
  for (const record of loaded.records) assert.equal(seen.get(record.id), JSON.stringify(record.raw), record.id);
  for (const bad of ['-1:0', 'NaN:0', '1:x', '99:0']) assert.throws(() => history.page(loaded, bad, 10), undefined, bad);
  assert.throws(() => history.page(loaded, undefined, 0), undefined, 'budget 0');
});

offline('history CLI: strict flags, cursors and session identity', () => {
  const cli = (args) => spawnSync(process.execPath, [historyCli, ...args], { encoding: 'utf8', env: { ...baseEnv(), CODEX_HOME: base.home } });
  assert.equal(cli(['--path', base.rollout, '--budget', '0']).status, 1);
  assert.equal(cli(['--path', base.rollout, '--from', 'NaN:0']).status, 1);
  assert.equal(cli(['--path', base.rollout, '--from', '-1:0']).status, 1);
  const other = cli(['--session', 'other-1', '--path', base.rollout]);
  assert.equal(other.status, 1);
  assert.ok(other.stderr.includes('belongs to session'), other.stderr);
  const ok = cli(['--path', base.rollout, '--budget', '40']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(/next: --path "[^"]+" --from \d+:\d+/.test(ok.stdout), ok.stdout);
});

offline('decisions CLI: strict flags; an explicit session with another session path is refused', () => {
  const other = runNode([decisionsCli, 'rebuild', '--session', 'other-1', '--path', base.rollout], base);
  assert.equal(other.status, 1);
  assert.ok(other.stderr.includes('belongs to session "fixture-session-1", not other-1'), other.stderr);
  assert.equal(runNode([decisionsCli, 'rebuild', '--session'], base).status, 1);
  assert.equal(runNode([decisionsCli, 'show', '--path', base.rollout], base).status, 1);
  assert.equal(runNode([decisionsCli, 'rebuild', '--session', SID], base, { SCOPE_FOCUS_DECISION_CHUNK_CHARS: '0' }).status, 1);
});

offline('rebuild: a long owner message is split losslessly; a decision quote stays whole', () => {
  const middle = 'Сохраняй таблицы в папке results/.';
  const filler = Array.from({ length: 60 }, (_, i) => `Абзац ${i + 1}: обычный текст без решений, который занимает место в сообщении.`).join('\n');
  const text = `${filler}\n${middle}\n${'Хвост без решений.\n'.repeat(40)}`;
  const env = makeHome();
  fs.writeFileSync(env.rollout, [
    { timestamp: '2026-10-17T10:00:00.000Z', type: 'session_meta', payload: { id: SID } },
    userMsg(text, 'T1', ['user.text']),
  ].map((line) => JSON.stringify(line)).join('\n') + '\n');
  env.rules = path.join(env.home, 'long-rules.json');
  fs.writeFileSync(env.rules, JSON.stringify([{ match: middle, exact: false, op: 'add', text: middle, quote: middle }]));
  const run = rebuild(env, { SCOPE_FOCUS_DECISION_CHUNK_CHARS: '2000' });
  assert.equal(run.status, 0, run.stderr);
  const made = callLog(env);
  assert.ok(made.length > 3, `several calls for one owner message: ${made.length}`);
  let end = 0;
  for (const call of made) {
    const m = inputOf(call).currentOwner.part?.match(/^(\d+)-(\d+) of (\d+)$/);
    assert.ok(m, 'part metadata is present');
    assert.equal(Number(m[1]), end, 'parts are contiguous');
    assert.equal(Number(m[3]), text.length, 'part metadata names the full length');
    assert.ok(call.stdin.length <= 2000, `input stays within the chunk bound: ${call.stdin.length}`);
    end = Number(m[2]);
  }
  assert.equal(end, text.length, 'the parts cover the whole text');
  const reg = registryOf(env);
  assert.deepEqual(activeTexts(reg), [['D1', middle]]);
  assert.equal(reg.decisions[0].quote, middle);
  assert.equal(reg.coverage.complete, true);
});

offline('rebuild: a failure after successful steps keeps the old registry and resumes from the saved cursor', () => {
  const oracle = registryOf(base);
  const before = registryBytes(base);
  const log = path.join(base.home, 'calls-resume.jsonl');
  const failed = rebuild(base, { FAKE_CODEX_FAIL_AFTER: '3', FAKE_CODEX_LOG: log });
  assert.equal(failed.status, 1);
  assert.ok(failed.stderr.includes('recorder failed (exit 3)'), failed.stderr);
  assert.ok(!failed.stderr.includes('abcdef123456'), 'recorder output is not echoed');
  assert.equal(registryBytes(base), before, 'the old registry is kept byte for byte');
  assert.equal(calls(log).length, 4, 'three successful calls and one failing call');
  const progress = JSON.parse(fs.readFileSync(progressFile(base), 'utf8'));
  assert.equal(progress.cursor.owner, 3, 'cursor after three owner messages');
  assert.equal(progress.sourceSha256.length, 64);
  const resumed = rebuild(base, { FAKE_CODEX_LOG: log });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.ok(resumed.stdout.includes('resumed from saved progress'), resumed.stdout);
  assert.equal(calls(log).length, 8, 'only the four remaining owner messages were replayed');
  assert.deepEqual(withoutSnapshot(registryOf(base)), withoutSnapshot(oracle));
  assert.equal(fs.existsSync(progressFile(base)), false, 'progress is removed after the commit');
});

offline('rebuild: a changed source discards the saved candidate instead of reusing it', () => {
  const env = makeHome();
  const failed = rebuild(env, { FAKE_CODEX_FAIL_AFTER: '2' });
  assert.equal(failed.status, 1);
  fs.appendFileSync(env.rollout, `${JSON.stringify({ timestamp: '2026-10-17T10:01:00.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: 'TX' } })}\n`);
  const run = rebuild(env);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('previous candidate discarded (source changed)'), run.stdout);
  assert.equal(callLog(env).length, 3 + 7, 'the changed source was replayed from the start');
});

offline('rebuild and show: a malformed registry is an error and is not overwritten', () => {
  const env = makeHome();
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.writeFileSync(registryFile(env), '{"sessionId":');
  const before = registryBytes(env);
  const run = rebuild(env);
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes('not valid JSON'), run.stderr);
  assert.equal(registryBytes(env), before);
  assert.equal(runNode([decisionsCli, 'show', '--session', SID], env).status, 1);
});

offline('show: a missing registry says that no history is recorded, not that coverage is complete', () => {
  const env = makeHome();
  const shown = runNode([decisionsCli, 'show', '--session', SID], env);
  assert.equal(shown.status, 0, shown.stderr);
  assert.ok(shown.stdout.includes('no recorded or backfilled history'), shown.stdout);
  assert.ok(!shown.stdout.includes('Coverage: complete'), shown.stdout);
});

offline('rebuild: an incomplete source is reported and does not overwrite the complete registry', () => {
  const env = makeHome();
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.writeFileSync(registryFile(env), registryBytes(base));
  const before = registryOf(env);
  fs.appendFileSync(env.rollout, '{"timestamp":"2026-10-17T10:02:00.000Z","type":"response_item"');
  const run = rebuild(env);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('registry kept'), run.stdout);
  const kept = registryOf(env);
  assert.deepEqual(kept.decisions, before.decisions, 'the decisions of the usable registry are kept');
  assert.equal(kept.coverage.complete, false, 'the gap of the current source is recorded');
  assert.ok(kept.coverage.limitations.some((l) => l.includes('incomplete final line')), kept.coverage.limitations.join('; '));
  assert.equal(fs.existsSync(progressFile(env)), true, 'the candidate is kept for inspection');
});

offline('rebuild: confirmed text outside the assistant message right before the owner is rejected before commit', () => {
  const bad = path.join(base.home, 'bad-rules.json');
  fs.writeFileSync(bad, JSON.stringify([{ match: '1a', exact: true, op: 'add', text: 'x', quote: '1a', confirmed: 'Записал: Markdown.' }]));
  const before = registryBytes(base);
  const run = rebuild({ ...base, rules: bad });
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes('right before'), run.stderr);
  assert.equal(registryBytes(base), before);
});

offline('history: mixed user kinds keep owner text; legacy copies, unknown kinds, bad rollbacks and identity are recorded', () => {
  const file = writeRollout([
    { type: 'session_meta', payload: { id: 'legacy-1' } },
    turn('T1'),
    userMsg('Сохраняй логи в logs/.', 'T1', ['user.text', 'user.image'], [{ type: 'input_image', image_url: 'data:image/png;base64,AAAA' }]),
    legacyMsg('Сохраняй логи в logs/.', 'T1'),
    turn('T2'),
    legacyMsg('Второе сообщение.'),
    userMsg('ping', 'T2', ['user.heartbeat']),
    userMsg('Непонятно.', 'T2', ['user.weird']),
    { type: 'event_msg', payload: { type: 'thread_rolled_back', num_turns: 'two' } },
  ]);
  const loaded = history.loadRecords(file);
  const by = (id) => loaded.records.find((r) => r.id === id);
  assert.equal(loaded.sessionId, 'legacy-1');
  assert.equal(by('L3').authority, 'owner');
  assert.equal(by('L3').text, 'Сохраняй логи в logs/.');
  assert.equal(by('L4').authority, 'duplicate', 'legacy copy in a turn with a modern owner');
  assert.equal(by('L6').authority, 'owner', 'legacy message of a turn without a modern owner');
  assert.equal(by('L7').authority, 'context');
  assert.equal(by('L8').authority, 'context');
  assert.ok(loaded.limitations.some((l) => l.includes('without a known owner classification')), loaded.limitations.join('; '));
  assert.ok(loaded.limitations.some((l) => l.includes('no valid num_turns')), loaded.limitations.join('; '));
  const noMeta = history.loadRecords(writeRollout([turn('X'), userMsg('Сохраняй.', 'X', ['user.text'])]));
  assert.equal(noMeta.sessionId, '');
  assert.ok(noMeta.limitations.some((l) => l.includes('first record is not session_meta')), noMeta.limitations.join('; '));
  const fork = history.loadRecords(writeRollout([{ type: 'session_meta', payload: { id: 'fork-1', parent_thread_id: 'p-1' } }]));
  assert.ok(fork.limitations.some((l) => l.includes('fork ancestry')), fork.limitations.join('; '));
});

offline('updatePrompt: a null transcript records the actual prompt once; a repeat is a duplicate; coverage is incomplete', () => {
  const env = makeHome();
  env.rules = path.join(env.home, 'rules.json');
  fs.writeFileSync(env.rules, JSON.stringify([{ match: 'Используй Markdown.', exact: true, op: 'add', text: 'Используй Markdown.', quote: 'Используй Markdown.' }]));
  const code = `const d = require(${JSON.stringify(decisionsCli)});
const input = { sessionId: 'null-1', turnId: 'TX', prompt: 'Используй Markdown.', transcriptPath: null };
console.log(JSON.stringify({ first: d.updatePrompt(input).status, second: d.updatePrompt(input).status }));`;
  const run = evalNode(code, env);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { first: 'recorded', second: 'duplicate' });
  assert.equal(callLog(env).length, 1, 'duplicate prompt makes no second call');
  const reg = JSON.parse(fs.readFileSync(registryFile(env, 'null-1'), 'utf8'));
  assert.equal(reg.decisions[0].text, 'Используй Markdown.');
  assert.equal(reg.decisions[0].source, 'turn-TX');
  assert.equal(reg.coverage.complete, false, 'missing transcript is a limitation, not complete');
});

offline('updatePrompt: a missing expected transcript is incomplete, not complete', () => {
  const env = makeHome();
  const code = `const d = require(${JSON.stringify(decisionsCli)}); console.log(JSON.stringify(d.updatePrompt({ sessionId: ${JSON.stringify(SID)}, turnId: 'TM', prompt: 'Ответь кратко.', transcriptPath: ${JSON.stringify(path.join(env.home, 'gone.jsonl'))} }).status));`;
  const run = evalNode(code, env);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout), 'recorded');
  const reg = registryOf(env);
  assert.equal(reg.coverage.complete, false);
  assert.ok(reg.coverage.limitations.some((l) => l.includes('transcript file missing')), reg.coverage.limitations.join('; '));
});

offline('updatePrompt: a prompt already in the transcript takes the assistant text before it, not the one after', () => {
  const env = makeHome();
  const code = `const d = require(${JSON.stringify(decisionsCli)}); console.log(JSON.stringify(d.updatePrompt({ sessionId: ${JSON.stringify(SID)}, turnId: 'T6', prompt: 'Gamma отменяем.', transcriptPath: ${JSON.stringify(env.rollout)} }).status));`;
  const run = evalNode(code, env);
  assert.equal(run.status, 0, run.stderr);
  const [call] = callLog(env);
  const input = inputOf(call);
  assert.equal(input.currentOwner.id, 'L19');
  assert.ok(input.precedingAssistant.some((record) => record.id === 'L17'), 'the assistant before the owner comes first');
  assert.ok(call.stdin.includes('alpha.md готов.') && call.stdin.includes('Принято:'), 'the text before the owner is sent');
  assert.ok(!call.stdin.includes('Хорошо, gamma.md снимаю.'), 'the assistant after the owner is not sent');
  assert.ok(!input.precedingAssistant.some((record) => record.id === 'L21') && input.currentOwner.id !== 'L21', 'later owners are not sent');
  const reg = registryOf(env);
  assert.equal(reg.coverage.complete, false);
  assert.ok(reg.coverage.limitations.some((l) => l.includes('earlier history not backfilled')), reg.coverage.limitations.join('; '));
});

offline('updatePrompt: a decision sourced in a rolled-back turn is retracted; an unflushed prompt keeps the rest', () => {
  const env = makeHome();
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.writeFileSync(registryFile(env), JSON.stringify({
    sessionId: SID,
    nextId: 3,
    decisions: [
      { id: 'D1', text: 'Отчёты в reports/.', quote: 'Сохраняй отчёты в папке reports/.', source: 'L3', status: 'active' },
      { id: 'D2', text: 'Формат: JSON.', quote: 'Отмени формат JSON, верни Markdown.', source: 'L23', status: 'active' },
    ],
    processed: {},
    coverage: { complete: true, limitations: [], backfilled: true },
  }));
  const code = `const d = require(${JSON.stringify(decisionsCli)}); console.log(JSON.stringify(d.updatePrompt({ sessionId: ${JSON.stringify(SID)}, turnId: 'T9', prompt: 'Про CSV пока ничего не решаю.', transcriptPath: ${JSON.stringify(env.rollout)} }).status));`;
  const run = evalNode(code, env);
  assert.equal(run.status, 0, run.stderr);
  const byId = Object.fromEntries(registryOf(env).decisions.map((d) => [d.id, d]));
  assert.equal(byId.D2.status, 'rolled-back');
  assert.equal(byId.D2.rolledBackBy, 'L25');
  assert.equal(byId.D1.status, 'active', 'a decision whose source is still in the transcript is kept');
});

offline('validateChanges: replace and cancel are checked in order against the ids still active', () => {
  const registry = {
    sessionId: SID,
    nextId: 2,
    decisions: [{ id: 'D1', text: 'x', quote: 'Сохраняй отчёты в папке reports/.', source: 'L3', status: 'active' }],
    processed: {},
    coverage: { complete: true, limitations: [], backfilled: true },
  };
  const owner = { id: 'L3', text: 'Сохраняй отчёты в папке reports/.' };
  const change = (op, id) => ({ op, id, text: op === 'cancel' ? '' : 'y', quote: owner.text, confirmed: '', source: 'L3', confirmedSource: '' });
  assert.equal(DECISIONS.validateChanges({ changes: [change('cancel', 'D1')] }, { owner, context: undefined }, registry).length, 1);
  assert.throws(() => DECISIONS.validateChanges({ changes: [change('cancel', 'D1'), change('cancel', 'D1')] }, { owner, context: undefined }, registry), /active id/);
  assert.throws(() => DECISIONS.validateChanges({ changes: [change('replace', 'D1'), change('cancel', 'D1')] }, { owner, context: undefined }, registry), /active id/);
});

offline('direct hook spawn: root prompt calls the recorder; subagent and nested paths make no call', () => {
  const env = makeHome();
  const hook = (input, extra = {}) => spawnSync(process.execPath, ['--require', SHIM, hookTodo], { encoding: 'utf8', input: JSON.stringify(input), env: envFor(env, extra) });
  const prompt = { session_id: 'hook-1', turn_id: 'HT', hook_event_name: 'UserPromptSubmit', prompt: 'Ответь кратко.', transcript_path: null };
  let run = hook(prompt);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.startsWith('<todo-reminder>'), run.stdout);
  assert.equal(callLog(env).length, 1, 'root prompt reached the recorder');
  run = hook({ ...prompt, agent_id: 'a1', agent_type: 'shell_runner' });
  assert.equal(run.stdout, '');
  run = hook({ ...prompt, turn_id: 'HN' }, { SCOPE_FOCUS_DECISION_RECORDER: '1' });
  assert.equal(run.stdout, '');
  assert.equal(callLog(env).length, 1, 'subagent and nested paths made no call');
});

offline('direct hook spawn: recorder failure emits native block JSON with a reason that carries no recorder output', () => {
  const env = makeHome();
  const run = spawnSync(process.execPath, ['--require', SHIM, hookTodo], {
    encoding: 'utf8',
    input: JSON.stringify({ session_id: 'hook-2', turn_id: 'HB', hook_event_name: 'UserPromptSubmit', prompt: 'Ответь кратко.', transcript_path: null }),
    env: envFor(env, { FAKE_CODEX_FAIL: '1' }),
  });
  assert.equal(run.status, 0, run.stderr);
  const decision = JSON.parse(run.stdout);
  assert.equal(decision.decision, 'block');
  assert.ok(decision.reason.includes('recorder failed (exit 3)'), decision.reason);
  assert.ok(!decision.reason.includes('abcdef123456'), 'recorder output is not echoed');
});

offline('direct hook spawn: the communication hook prints nothing in a nested recorder run', () => {
  const run = spawnSync(process.execPath, [hookCommunication], {
    encoding: 'utf8',
    input: '',
    env: { ...baseEnv(), SCOPE_FOCUS_DECISION_RECORDER: '1' },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
});

offline('direct hook spawn: root SessionStart (startup, resume, compact) carries the saved decisions; SubagentStart carries none and makes no call', () => {
  const env = makeHome();
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.writeFileSync(registryFile(env), registryBytes(base));
  const inline = DECISIONS.renderMarkdown(registryOf(env));
  const pointer = `show --session ${SID}`;
  const hook = (input) => spawnSync(process.execPath, ['--require', SHIM, hookCommunication], { encoding: 'utf8', input: JSON.stringify({ session_id: SID, ...input }), env: envFor(env) });
  for (const source of ['startup', 'resume', 'compact']) {
    const run = hook({ hook_event_name: 'SessionStart', source });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes('Session decisions of this session.'), `${source}: decisions section`);
    assert.ok(run.stdout.includes(inline) || run.stdout.includes(pointer), `${source}: saved decisions or full pointer`);
  }
  const sub = hook({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'shell_runner' });
  assert.equal(sub.status, 0, sub.stderr);
  assert.ok(!sub.stdout.includes('Session decisions of this session.') && !sub.stdout.includes(inline) && !sub.stdout.includes(pointer), 'subagent inherits no decisions');
  assert.deepEqual(callLog(env), [], 'no hook call reached the recorder');
});

const emptyRules = (env) => {
  env.rules = path.join(env.home, 'empty-rules.json');
  fs.writeFileSync(env.rules, '[]');
  return env;
};
const updateOnce = (env, transcriptPath) => evalNode(`const d = require(${JSON.stringify(decisionsCli)}); console.log(JSON.stringify(d.updatePrompt({ sessionId: ${JSON.stringify(SID)}, turnId: 'T9', prompt: 'Ответь кратко.', transcriptPath: ${JSON.stringify(transcriptPath)} }).status));`, env);
const sha256Of = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

offline('history: the first page freezes a snapshot; appending the original leaves the snapshot pages unchanged', () => {
  const env = makeHome();
  const first = runNode([historyCli, '--session', SID, '--budget', '40'], env);
  assert.equal(first.status, 0, first.stderr);
  const next = first.stdout.match(/next: --path "([^"]+)" --from (\d+:\d+)/);
  assert.ok(next, first.stdout);
  const [, snapshot, cursor] = next;
  const count = history.loadRecords(snapshot).records.length;
  fs.appendFileSync(env.rollout, `${JSON.stringify(turn('TZ'))}\n`);
  const second = runNode([historyCli, '--path', snapshot, '--from', cursor, '--budget', '40'], env);
  assert.equal(second.status, 0, second.stderr);
  assert.ok(second.stdout.includes(`=== history ${snapshot}`), second.stdout);
  assert.equal(history.loadRecords(snapshot).records.length, count, 'the snapshot keeps its records');
  assert.equal(history.loadRecords(env.rollout).records.length, count + 1, 'the original grew');
});

offline('rebuild: coverage names the original, its snapshot and the hash of the bytes replayed', () => {
  const source = registryOf(base).coverage.source;
  assert.equal(source.path, base.rollout);
  assert.equal(sha256Of(source.snapshot), source.sha256);
  assert.equal(source.records, history.loadRecords(base.rollout).records.length);
});

offline('history: a context part beside owner text is not owner text; a known context kind is context', () => {
  const file = writeRollout([
    { type: 'session_meta', payload: { id: 'mixed-1' } },
    turn('T1'),
    userMsg('# AGENTS.md instructions', 'T1', ['agents_md.instructions', 'user.text'], [{ type: 'input_text', text: 'Сохраняй логи в logs/.' }]),
    userMsg('hook output', 'T1', ['hooks.additional_context']),
    userMsg('unlabelled', 'T1', ['unknown']),
  ]);
  const loaded = history.loadRecords(file);
  const by = (id) => loaded.records.find((r) => r.id === id);
  assert.equal(by('L3').authority, 'owner');
  assert.equal(by('L3').text, 'Сохраняй логи в logs/.');
  assert.equal(by('L4').kind, 'user-context');
  assert.equal(by('L5').kind, 'user-unclassified');
  assert.ok(loaded.limitations.some((l) => l.includes('without a known owner classification')), loaded.limitations.join('; '));
});

offline('history: a stop hook prompt (one hook_prompt element, kind unknown) is context; a bare unknown message is not', () => {
  const hookPrompt = '<hook_prompt hook_run_id="stop:3:/plugins/scope-focus/hooks/hooks.json">The todo list still has open items:\n- 1.1 Один (in_progress)\n- 1.2 Два (pending)\nBefore finishing, mark each one done, drop it if it is no longer needed, or block it with a reason if it waits for the user or another event.</hook_prompt>';
  const hooked = history.loadRecords(writeRollout([{ type: 'session_meta', payload: { id: 'hook-prompt-1' } }, turn('T1'), userMsg(hookPrompt, 'T1', ['unknown'])]));
  assert.equal(hooked.records.find((r) => r.id === 'L3').kind, 'user-context');
  assert.equal(hooked.records.find((r) => r.id === 'L3').authority, 'context');
  assert.deepEqual(hooked.limitations, [], 'the hook prompt is not an unknown owner gap');
  const bare = history.loadRecords(writeRollout([{ type: 'session_meta', payload: { id: 'hook-prompt-2' } }, turn('T1'), userMsg('Непонятно.', 'T1', ['unknown'])]));
  assert.equal(bare.records.find((r) => r.id === 'L3').kind, 'user-unclassified');
  assert.ok(bare.limitations.some((l) => l.includes('without a known owner classification')), bare.limitations.join('; '));
});

offline('rollback: a rolled-back replacement revives the rule it replaced, a rolled-back cancellation reactivates, and a live turn source is matched by turn', () => {
  const metaLine = { type: 'session_meta', payload: { id: SID } };
  const rolledBack = (numTurns) => ({ type: 'event_msg', payload: { type: 'thread_rolled_back', num_turns: numTurns } });
  const row = (fields) => ({ confirmed: '', confirmedSource: '', provenance: { kind: 'rebuild', path: 'x', sha256: 'x' }, ...fields });
  const cases = [
    {
      name: 'replacement',
      lines: [metaLine, turn('T1'), userMsg('Формат: Markdown.', 'T1', ['user.text']), turn('T2'), userMsg('Формат: JSON.', 'T2', ['user.text']), rolledBack(1)],
      decisions: [
        row({ id: 'D1', text: 'Формат: Markdown.', quote: 'Формат: Markdown.', source: 'L3', status: 'replaced', replacedBy: 'D2' }),
        row({ id: 'D2', text: 'Формат: JSON.', quote: 'Формат: JSON.', source: 'L5', status: 'active', replaces: 'D1' }),
      ],
      expect: { D1: ['active'], D2: ['rolled-back', 'L6'] },
    },
    {
      name: 'cancellation',
      lines: [metaLine, turn('T1'), userMsg('Сохраняй отчёты в папке reports/.', 'T1', ['user.text']), turn('T2'), userMsg('Отмени правило про папку reports/.', 'T2', ['user.text']), rolledBack(1)],
      decisions: [
        row({ id: 'D1', text: 'Сохранять отчёты в папке reports/.', quote: 'Сохраняй отчёты в папке reports/.', source: 'L3', status: 'cancelled', cancelledBy: { source: 'L5', quote: 'Отмени правило про папку reports/.' } }),
      ],
      expect: { D1: ['active'] },
    },
    {
      name: 'live turn',
      lines: [metaLine, turn('T5'), userMsg('Сохраняй логи в logs/.', 'T5', ['user.text']), rolledBack(1)],
      decisions: [
        row({ id: 'D1', text: 'Логи в logs/.', quote: 'Сохраняй логи в logs/.', source: 'turn-T5', status: 'active', provenance: { kind: 'live', turnId: 'T5', promptSha256: 'x', transcriptPath: null } }),
      ],
      expect: { D1: ['rolled-back', 'L4'] },
    },
  ];
  for (const c of cases) {
    const env = emptyRules(makeHome());
    const rollout = writeRollout(c.lines);
    fs.mkdirSync(stateDir(env), { recursive: true });
    fs.writeFileSync(registryFile(env), JSON.stringify({ sessionId: SID, nextId: 10, decisions: c.decisions, processed: {}, coverage: { complete: true, limitations: [], backfilled: true } }));
    const run = updateOnce(env, rollout);
    assert.equal(run.status, 0, `${c.name}: ${run.stderr}`);
    const byId = Object.fromEntries(registryOf(env).decisions.map((d) => [d.id, d]));
    for (const [id, [status, by]] of Object.entries(c.expect)) {
      assert.equal(byId[id].status, status, `${c.name} ${id}`);
      if (by !== undefined) assert.equal(byId[id].rolledBackBy, by, `${c.name} ${id}`);
    }
  }
});

offline('updatePrompt: an unclassified message in the transcript makes an existing complete registry incomplete', () => {
  const env = emptyRules(makeHome());
  const rollout = writeRollout([{ type: 'session_meta', payload: { id: SID } }, turn('T1'), userMsg('без метки', 'T1', ['unknown'])]);
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.writeFileSync(registryFile(env), JSON.stringify({ sessionId: SID, nextId: 1, decisions: [], processed: {}, coverage: { complete: true, limitations: [], backfilled: true } }));
  const run = updateOnce(env, rollout);
  assert.equal(run.status, 0, run.stderr);
  const reg = registryOf(env);
  assert.equal(reg.coverage.complete, false);
  assert.ok(reg.coverage.limitations.some((l) => l.includes('without a known owner classification')), reg.coverage.limitations.join('; '));
});

// The fixture with its two compaction markers moved across owner boundaries: the first just after the owner "1a", the
// second just after the owner "Отмени правило про папку reports/.". Every other line keeps its bytes and its order.
function moveCompactions(text) {
  const lines = text.split('\n').filter((line) => line !== '');
  const markers = lines.filter((line) => JSON.parse(line).type === 'compacted');
  assert.equal(markers.length, 2, 'the fixture has two compaction markers');
  const rows = lines.filter((line) => JSON.parse(line).type !== 'compacted');
  const insertAfterOwner = (owner, line) => {
    const at = rows.findIndex((row) => JSON.parse(row).payload?.content?.[0]?.text === owner);
    assert.ok(at >= 0, `owner "${owner}" is in the fixture`);
    rows.splice(at + 1, 0, line);
  };
  insertAfterOwner('Отмени правило про папку reports/.', markers[1]);
  insertAfterOwner('1a', markers[0]);
  return `${rows.join('\n')}\n`;
}

// Raw JSON of every record, rebuilt from the pages of one budget, in record order.
function reconstruct(loaded, budget) {
  const text = new Map(loaded.records.map((r) => [r.id, '']));
  let from;
  let guard = 0;
  do {
    const page = history.page(loaded, from, budget);
    for (const part of page.parts) text.set(part.id, text.get(part.id) + part.text);
    from = page.next;
    assert.ok(++guard < 100000, 'pagination terminates');
  } while (from);
  return loaded.records.map((r) => text.get(r.id));
}

// Owner records counted before each compaction marker.
function ownersBeforeCompactions(loaded) {
  const counts = [];
  let owners = 0;
  for (const record of loaded.records) {
    if (record.kind === 'compaction') counts.push(owners);
    if (record.kind === 'owner') owners++;
  }
  return counts;
}

// Normalized active meaning: the owner quote and the approved proposal text of each active decision, sorted. Ids,
// line-based sources, the wording of the decision text and snapshot paths change with the layout and are left out.
const activeMeaning = (registry) => registry.decisions
  .filter((d) => d.status === 'active')
  .map((d) => JSON.stringify([d.quote, d.confirmed ?? '']))
  .sort();
const OFFLINE_ACTIVE = [
  JSON.stringify(['Формат отчётов теперь JSON, а не Markdown.', '']),
  JSON.stringify(['alpha.md', '']),
  JSON.stringify(['beta.md', '']),
].sort();

// Every decision is grounded: its quote is part of the owner record it names, its approval is part of an assistant
// record, and its cancellation quote is part of the owner record that cancels it. Returns the problems, if any.
function groundingProblems(registry, loaded) {
  const byId = new Map(loaded.records.map((r) => [r.id, r]));
  const problems = [];
  for (const d of registry.decisions) {
    const owner = byId.get(d.source);
    if (owner?.kind !== 'owner' || !owner.text.includes(d.quote)) problems.push(`${d.id}: quote is not in ${d.source}`);
    if (d.confirmed) {
      const proposal = byId.get(d.confirmedSource);
      if (proposal?.kind !== 'assistant' || !proposal.text.includes(d.confirmed)) problems.push(`${d.id}: approval is not in ${d.confirmedSource}`);
    }
    if (d.cancelledBy) {
      const cancel = byId.get(d.cancelledBy.source);
      if (cancel?.kind !== 'owner' || !cancel.text.includes(d.cancelledBy.quote)) problems.push(`${d.id}: cancellation is not in ${d.cancelledBy.source}`);
    }
  }
  return problems;
}

// The meaning oracle of this fixture. Owner records are located by their text in the file the registry was recorded
// from, so no line number is assumed.
function assertMeaningOracle(registry, file) {
  const loaded = history.loadRecords(file);
  const ownerId = (text) => {
    const found = loaded.records.filter((r) => r.kind === 'owner' && r.authority === 'owner' && r.text === text);
    assert.equal(found.length, 1, `one owner record reads "${text}"`);
    return found[0].id;
  };
  const active = registry.decisions.filter((d) => d.status === 'active');
  assert.ok(active.some((d) => /JSON/.test(d.text) && d.source === ownerId('Формат отчётов теперь JSON, а не Markdown.')), `format JSON from its owner is active: ${JSON.stringify(active)}`);
  const markdown = registry.decisions.filter((d) => d.source === ownerId('1a'));
  assert.ok(markdown.length > 0 && markdown.every((d) => d.status !== 'active'), `Markdown selection is not active: ${JSON.stringify(markdown)}`);
  assert.ok(!active.some((d) => /reports/.test(`${d.text} ${d.quote}`)), 'cancelled reports folder is not active');
  assert.ok(!active.some((d) => /CSV|ZZZ/.test(`${d.text} ${d.quote}`)), 'no unaccepted CSV or injected text is active');
  assert.ok(!active.some((d) => /gamma/i.test(d.text) && !/alpha|beta/i.test(d.text)), 'cancelled gamma is not active');
}

// Open todo tasks of a state as sorted "artifact, status" pairs. The artifact is the alpha, beta or gamma .md file the
// task names; a task naming none keeps its own text, so it never matches the oracle by accident.
const openTasks = (state) => state.phases.flatMap((phase) => phase.tasks)
  .filter((task) => ['pending', 'in_progress', 'blocked'].includes(task.status))
  .map((task) => JSON.stringify([task.content.match(/\b(alpha|beta|gamma)\.md\b/i)?.[1].toLowerCase() ?? task.content, task.status]))
  .sort();
const TODO_ORACLE = [JSON.stringify(['beta', 'blocked'])];

// Metamorphic check (offline): one history, its two compaction markers moved across owner boundaries. The owner,
// assistant, tool and event records keep their order and bytes, so the pages, the replays under two chunk bounds and
// the active meaning must all stay the same. The bounds are large enough for these short messages.
offline('metamorphic: moved compaction markers keep the history, the pages and the active decisions', () => {
  const original = fs.readFileSync(path.join(FIX, 'rollout.jsonl'), 'utf8');
  const variant = moveCompactions(original);
  assert.notEqual(variant, original, 'the markers moved');
  const orig = history.parseRecords(Buffer.from(original, 'utf8'), 'original.jsonl');
  const moved = history.parseRecords(Buffer.from(variant, 'utf8'), 'variant.jsonl');
  const kept = (loaded) => loaded.records.filter((r) => r.kind !== 'compaction').map((r) => JSON.stringify(r.raw));
  const markers = (loaded) => loaded.records.filter((r) => r.kind === 'compaction').map((r) => JSON.stringify(r.raw));
  assert.deepEqual(kept(moved), kept(orig), 'owner, assistant, tool and event records keep their order and content');
  assert.deepEqual(markers(moved), markers(orig), 'the compaction markers keep their content');
  assert.deepEqual(ownersBeforeCompactions(orig), [4, 5]);
  assert.deepEqual(ownersBeforeCompactions(moved), [2, 7], 'each marker crossed owner boundaries');
  assert.deepEqual(moved.limitations, []);
  for (const budget of [37, 900]) {
    const rebuilt = reconstruct(moved, budget);
    assert.deepEqual(rebuilt, moved.records.map((r) => JSON.stringify(r.raw)), `budget ${budget}: every record is rebuilt exactly`);
    const originalPages = reconstruct(orig, budget);
    assert.deepEqual(rebuilt.filter((_, i) => moved.records[i].kind !== 'compaction'), originalPages.filter((_, i) => orig.records[i].kind !== 'compaction'), `budget ${budget}: original records are identical`);
  }
  const replayed = (text, bound) => {
    const env = makeHome();
    fs.writeFileSync(env.rollout, text);
    const run = rebuild(env, { SCOPE_FOCUS_DECISION_CHUNK_CHARS: bound });
    assert.equal(run.status, 0, run.stderr);
    return registryOf(env);
  };
  const replays = ['4000', '12000'].flatMap((bound) => [
    { loaded: orig, reg: replayed(original, bound) },
    { loaded: moved, reg: replayed(variant, bound) },
  ]);
  for (const { loaded, reg } of replays) {
    assert.equal(reg.coverage.complete, true, 'replay is complete');
    assert.deepEqual(reg.coverage.limitations, []);
    assert.deepEqual(activeMeaning(reg), OFFLINE_ACTIVE, 'active decisions: the JSON rule, alpha.md and beta.md');
    assert.deepEqual(groundingProblems(reg, loaded), [], 'every decision is grounded in its own history');
  }
  assert.notDeepEqual(replays[0].reg.decisions.map((d) => d.source), replays[1].reg.decisions.map((d) => d.source), 'the variant names its own owner records');
});

// TEST ONLY (--live --resume-home PATH). PATH must be an existing test home, not an active home, that holds this fixture
// session with a complete registry recorded from the current fixture bytes, and whose source snapshot is intact. Its
// registry is copied byte for byte into the new temp home; the recorder is not called.
function reuseRecorderRegistry(env, resumeHome, activeHomes) {
  const resolved = path.resolve(resumeHome);
  assert.ok(fs.existsSync(resolved) && fs.statSync(resolved).isDirectory(), `resume home exists: ${resolved}`);
  assert.ok(!activeHomes.some((home) => path.resolve(home) === resolved), `resume home is not the active home: ${resolved}`);
  const file = registryFile({ home: resolved });
  assert.ok(fs.existsSync(file), `resume registry exists: ${file}`);
  const prior = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(prior.sessionId, SID, 'resume registry has the test fixture session id');
  assert.equal(prior.coverage.complete, true, 'resume registry is complete');
  assert.equal(prior.coverage.source.sha256, sha256Of(env.rollout), 'resume registry was recorded from the current fixture bytes');
  assert.equal(sha256Of(prior.coverage.source.snapshot), prior.coverage.source.sha256, 'resume source snapshot is intact');
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.copyFileSync(file, registryFile(env));
}

// Main's restore run (gpt-6-sol, low) in an isolated home: the restore skill texts as instructions, the registry shown
// before history, the history read page by page at `budget`, then the todo written. Hooks and plugins are off in this
// run and the skill texts are supplied directly. Returns the shell commands in order and the JSON events.
function restoreRun(env, liveEnv, evidence, budget) {
  const skill = (name) => fs.readFileSync(path.join(root, 'plugins', 'scope-focus', 'skills', name, 'SKILL.md'), 'utf8');
  const todoCli = path.join(TOOLS, 'todo.cjs');
  const prompt = [
    'You are the root Main of a Codex session that is being restored. Hooks and plugins are off in this run; the two skill texts below are the instructions you must follow.',
    `# restore-session\n${skill('restore-session')}`,
    `# restore-todo\n${skill('restore-todo')}`,
    `Source session: ${SID}. Decisions CLI: node "${decisionsCli}". History CLI: node "${historyCli}". Todo CLI: node "${todoCli}".`,
    `Required order: (1) run node "<Decisions CLI>" show --session ${SID} and read its whole output, including the source snapshot and the history command it prints; (2) read the whole raw history of that snapshot with the History CLI at --budget ${budget}: add --budget ${budget} to the history command the Decisions CLI prints and to every printed next-page command, page by page, until the end of history, in separate shell calls; (3) only after that, decide from the registry and that history which agreed work still remains, and write the todo list with the Todo CLI, each call prefixed by CODEX_THREAD_ID=${SID}. This run restores only: every recovered item is blocked with the reason "waiting for the owner's instruction to continue".`,
    'Do not run or write any project file, do not start any work item, and do not change other todo items. Finish with one short line stating how many history pages you read.',
  ].join('\n\n');
  fs.writeFileSync(path.join(evidence, 'main-prompt.txt'), redact(prompt));
  const codex = DECISIONS.resolveCodex();
  const main = spawnSync(codex, ['exec', '-m', 'gpt-6-sol', '-c', 'model_reasoning_effort="low"', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--disable', 'hooks', '--disable', 'plugins', '--json', '-'], {
    input: prompt,
    encoding: 'utf8',
    timeout: 900000,
    cwd: env.home,
    env: liveEnv,
    maxBuffer: 256 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(evidence, 'main-stdout.jsonl'), redact(main.stdout ?? ''));
  fs.writeFileSync(path.join(evidence, 'main-stderr.txt'), redact(main.stderr ?? ''));
  assert.equal(main.status, 0, main.stderr);

  // Evidence: the shell commands of the run in order, read from the JSON event stream.
  const events = main.stdout.split('\n').filter((line) => line.trim() !== '').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  // Commands of the run in order: command_execution items are the shell calls. A generic "command" key is read
  // only when the stream has no command item.
  const itemCommands = new Map();
  for (const event of events) {
    const item = event.item;
    if (item?.type === 'command_execution' && typeof item.command === 'string') itemCommands.set(item.id ?? itemCommands.size, item.command);
  }
  const commands = [...itemCommands.values()];
  if (commands.length === 0) {
    const collect = (value) => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') {
        for (const [key, part] of Object.entries(value)) {
          if (key === 'command' && typeof part === 'string') {
            if (commands.at(-1) !== part) commands.push(part);
          } else {
            collect(part);
          }
        }
      }
    };
    events.forEach(collect);
  }
  fs.writeFileSync(path.join(evidence, 'commands.json'), redact(JSON.stringify(commands, null, 2)));
  return { commands, events };
}

if (LIVE) {
  check('live: real recorder and a real restore by Main run in isolated homes with copies of auth and config only', () => {
    const sourceHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    // Raw evidence of this run stays in an OS temporary directory (credentials are redacted, auth is never copied).
    const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'sd live evidence '));
    console.log(`LIVE evidence: ${evidence}`);
    const env = makeHome();
    for (const name of ['auth.json', 'config.toml']) {
      const from = path.join(sourceHome, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(env.home, name));
    }
    const liveEnv = { ...baseEnv(), CODEX_HOME: env.home };
    delete liveEnv.CODEX_THREAD_ID;

    if (RESUME_HOME) {
      reuseRecorderRegistry(env, RESUME_HOME, [sourceHome, path.join(os.homedir(), '.codex')]);
      console.log(`LIVE recorder: resumed registry from ${RESUME_HOME}; recorder not called`);
    } else {
      // Recorder: the real codex (gpt-6.1-sol, low) through decisions rebuild, on the fixture rollout.
      const recorder = spawnSync(process.execPath, [decisionsCli, 'rebuild', '--session', SID], { encoding: 'utf8', timeout: 900000, env: liveEnv });
      fs.writeFileSync(path.join(evidence, 'recorder-stdout.txt'), redact(recorder.stdout ?? ''));
      fs.writeFileSync(path.join(evidence, 'recorder-stderr.txt'), redact(recorder.stderr ?? ''));
      assert.equal(recorder.status, 0, recorder.stderr);
    }
    const reg = registryOf(env);
    const active = reg.decisions.filter((d) => d.status === 'active');
    assert.ok(active.some((d) => /JSON/.test(d.text) && d.source === 'L7'), `format JSON from L7 survives: ${JSON.stringify(active)}`);
    assert.ok(!active.some((d) => /reports/.test(`${d.text} ${d.quote}`)), 'cancelled reports folder is not active');
    const fromMarkdown = reg.decisions.filter((d) => d.source === 'L5');
    assert.ok(fromMarkdown.length > 0 && fromMarkdown.every((d) => d.status !== 'active'), `Markdown selection of L5 is not active: ${JSON.stringify(fromMarkdown)}`);
    assert.ok(!active.some((d) => /CSV|ZZZ/.test(`${d.text} ${d.quote}`)), 'no unaccepted CSV or injected text is active');
    assert.ok(!active.some((d) => /gamma/i.test(d.text) && !/alpha|beta/i.test(d.text)), 'cancelled gamma is not active');
    console.log(`LIVE recorder: home=${env.home} registry=${registryFile(env)} active=${JSON.stringify(active.map((d) => [d.id, d.text, d.source]))}`);

    // The alpha.md of the fixture history is already written in this isolated workspace, as that history says.
    fs.mkdirSync(path.join(env.home, 'results'), { recursive: true });
    fs.writeFileSync(path.join(env.home, 'results', 'alpha.md'), 'alpha');

    const { commands, events } = restoreRun(env, liveEnv, evidence, 1500);
    const lastIndex = (pattern) => commands.map((c) => pattern.test(c)).lastIndexOf(true);
    const showAt = commands.findIndex((c) => /decisions\.cjs.* show\b/.test(c));
    const firstHistory = commands.findIndex((c) => /session-history\.cjs/.test(c));
    assert.ok(showAt >= 0 && (firstHistory < 0 || showAt < firstHistory), `registry shown before history: ${commands.join(' | ')}`);
    assert.ok(commands.filter((c) => /session-history\.cjs/.test(c)).length >= 2, 'several history pages were read');
    assert.ok(commands.some((c) => /--from /.test(c)), 'pages followed the printed cursor');
    assert.ok(commands.filter((c) => /--from /.test(c)).every((c) => /--budget 1500\b/.test(c)), 'next-page calls kept the test budget');
    assert.ok(JSON.stringify(events).includes('end of history'), 'history was read to the end (event stream)');
    const todoAt = lastIndex(/todo\.cjs/);
    assert.ok(todoAt > lastIndex(/session-history\.cjs/), 'todo written after the history pages');
    assert.ok(commands[todoAt].includes(`CODEX_THREAD_ID=${SID}`), `todo call names the source session: ${commands[todoAt]}`);
    assert.ok(!commands.some((c) => /results\//.test(c) && /(printf|tee|touch|echo|>)/.test(c)), 'no project file was written');

    // Output: the one open todo item of the source session, in its own todo state file.
    const todoFile = path.join(env.home, 'scope-focus-todo', `todo-${SID}.json`);
    const state = JSON.parse(fs.readFileSync(todoFile, 'utf8'));
    const items = state.phases.flatMap((phase) => phase.tasks.map((task) => ({ phase: phase.name, ...task })));
    const open = items.filter((task) => ['pending', 'in_progress', 'blocked'].includes(task.status));
    assert.equal(open.length, 1, `exactly one open item: ${JSON.stringify(open)}`);
    assert.ok(/beta/i.test(open[0].content) && open[0].status === 'blocked', `open item is blocked beta: ${JSON.stringify(open[0])}`);
    console.log(`LIVE restore: home=${env.home} todo=${todoFile} open=${JSON.stringify(open)} commands=${JSON.stringify(commands)}`);
  });
}

// TEST ONLY (--live-equivalence --baseline-home PATH): the variant live scenario and nothing else. Only the two compaction
// markers move (moveCompactions). The real recorder and the real Main restore run in a new temp home, Main at this run's
// history budget; neither is given an expected answer. The baseline home is validated and read, never re-run.
const EQUIVALENCE_BUDGET = 900;
if (EQUIVALENCE) {
  check('live equivalence: the moved-marker variant gives the baseline active decisions and remaining todo', () => {
    const sourceHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const baselineHome = path.resolve(BASELINE_HOME);
    // The baseline evidence is validated and read; it is never re-run and never the active home.
    assert.ok(fs.existsSync(baselineHome) && fs.statSync(baselineHome).isDirectory(), `baseline home exists: ${baselineHome}`);
    assert.ok(![sourceHome, path.join(os.homedir(), '.codex')].some((home) => path.resolve(home) === baselineHome), `baseline home is not the active home: ${baselineHome}`);
    const baselineReg = JSON.parse(fs.readFileSync(registryFile({ home: baselineHome }), 'utf8'));
    assert.equal(baselineReg.sessionId, SID, 'baseline registry has the fixture session id');
    assert.equal(baselineReg.coverage.complete, true, 'baseline registry is complete');
    assert.deepEqual(baselineReg.coverage.limitations, [], 'baseline registry has no limitation');
    assert.equal(baselineReg.coverage.source.sha256, sha256Of(path.join(FIX, 'rollout.jsonl')), 'baseline registry was recorded from the fixture bytes');
    assert.equal(sha256Of(baselineReg.coverage.source.snapshot), baselineReg.coverage.source.sha256, 'baseline source snapshot is intact');
    assertMeaningOracle(baselineReg, baselineReg.coverage.source.snapshot);
    const baselineTodo = JSON.parse(fs.readFileSync(path.join(baselineHome, 'scope-focus-todo', `todo-${SID}.json`), 'utf8'));
    assert.deepEqual(openTasks(baselineTodo), TODO_ORACLE, 'baseline todo: one open beta task, blocked');

    // The variant: a new temp home with copies of auth and config only, and the fixture rollout with its markers moved.
    const env = makeHome();
    for (const name of ['auth.json', 'config.toml']) {
      const from = path.join(sourceHome, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(env.home, name));
    }
    const variant = moveCompactions(fs.readFileSync(path.join(FIX, 'rollout.jsonl'), 'utf8'));
    fs.writeFileSync(env.rollout, variant);
    const liveEnv = { ...baseEnv(), CODEX_HOME: env.home };
    delete liveEnv.CODEX_THREAD_ID;
    const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'sd live equivalence evidence '));
    console.log(`LIVE equivalence evidence: ${evidence}`);
    fs.writeFileSync(path.join(evidence, 'variant-rollout.jsonl'), variant);

    // Recorder: the real codex (gpt-6.1-sol, low) through decisions rebuild, on the variant rollout.
    const recorder = spawnSync(process.execPath, [decisionsCli, 'rebuild', '--session', SID], { encoding: 'utf8', timeout: 900000, env: liveEnv });
    fs.writeFileSync(path.join(evidence, 'recorder-stdout.txt'), redact(recorder.stdout ?? ''));
    fs.writeFileSync(path.join(evidence, 'recorder-stderr.txt'), redact(recorder.stderr ?? ''));
    assert.equal(recorder.status, 0, recorder.stderr);
    const reg = registryOf(env);
    assert.equal(reg.coverage.complete, true, 'variant registry is complete');
    assert.deepEqual(reg.coverage.limitations, [], 'variant registry has no limitation');
    assert.equal(reg.coverage.source.sha256, sha256Of(env.rollout), 'variant registry was recorded from the variant bytes');
    assert.equal(sha256Of(reg.coverage.source.snapshot), reg.coverage.source.sha256, 'variant source snapshot is intact');
    assert.deepEqual(groundingProblems(reg, history.loadRecords(env.rollout)), [], 'every variant decision is grounded in its owner text');
    assertMeaningOracle(reg, env.rollout);
    assert.deepEqual(activeMeaning(reg), activeMeaning(baselineReg), 'active decisions equal the baseline (quotes and approved proposals)');
    console.log(`LIVE equivalence recorder: home=${env.home} registry=${registryFile(env)} active=${JSON.stringify(activeMeaning(reg))}`);

    // The alpha.md of the history is already written in this isolated workspace, as in the live run.
    fs.mkdirSync(path.join(env.home, 'results'), { recursive: true });
    fs.writeFileSync(path.join(env.home, 'results', 'alpha.md'), 'alpha');

    // Main: the same restore skills, the history read at this run's budget, no expected answers.
    const { commands, events } = restoreRun(env, liveEnv, evidence, EQUIVALENCE_BUDGET);

    // Commands: the registry is shown before history; the history is read from the registry's snapshot in pages at the
    // budget; the todo is written after the last page. The snapshot and order checks are the same as in the live run.
    const snapshot = reg.coverage.source.snapshot;
    const lastIndex = (pattern) => commands.map((c) => pattern.test(c)).lastIndexOf(true);
    const showAt = commands.findIndex((c) => /decisions\.cjs.* show\b/.test(c));
    const firstHistory = commands.findIndex((c) => /session-history\.cjs/.test(c));
    assert.ok(showAt >= 0 && (firstHistory < 0 || showAt < firstHistory), `registry shown before history: ${commands.join(' | ')}`);
    const historyCommands = commands.filter((c) => /session-history\.cjs/.test(c));
    assert.ok(historyCommands.length >= 2, 'several history pages were read');
    assert.ok(historyCommands.some((c) => c.includes(snapshot)), 'history was read from the source snapshot of the registry');
    const nextPages = commands.filter((c) => /--from /.test(c));
    assert.ok(nextPages.length > 0, 'pages followed the printed cursor');
    // Each later page reads the History CLI's own copy of the snapshot (the first page makes it), so the check is the
    // bytes behind its --path: the copy must hash to the registry's source sha256.
    const pathOf = (c) => c.match(/--path "([^"]+)"/)?.[1];
    assert.ok(nextPages.every((c) => {
      const file = pathOf(c);
      return file !== undefined && fs.existsSync(file) && sha256Of(file) === reg.coverage.source.sha256 && new RegExp(`--budget ${EQUIVALENCE_BUDGET}\\b`).test(c);
    }), 'next-page calls read bytes equal to the source snapshot and kept the budget');
    assert.ok(JSON.stringify(events).includes('end of history'), 'history was read to the end (event stream)');
    const todoAt = lastIndex(/todo\.cjs/);
    assert.ok(todoAt > lastIndex(/session-history\.cjs/), 'todo written after the history pages');
    assert.ok(commands[todoAt].includes(`CODEX_THREAD_ID=${SID}`), `todo call names the source session: ${commands[todoAt]}`);
    assert.ok(!commands.some((c) => /results\//.test(c) && /(printf|tee|touch|echo|>)/.test(c)), 'no project file was written');

    // Output: the open todo tasks of the source session, compared with the baseline run and with the independent oracle.
    const todoFile = path.join(env.home, 'scope-focus-todo', `todo-${SID}.json`);
    const state = JSON.parse(fs.readFileSync(todoFile, 'utf8'));
    assert.deepEqual(openTasks(state), openTasks(baselineTodo), `remaining todo equals the baseline: ${JSON.stringify(openTasks(state))}`);
    assert.deepEqual(openTasks(state), TODO_ORACLE, 'remaining todo is the independent oracle: beta, blocked');
    console.log(`LIVE equivalence restore: home=${env.home} todo=${todoFile} open=${JSON.stringify(openTasks(state))} commands=${JSON.stringify(commands)}`);
  });
}

if (failures.length === 0) console.log(LIVE ? 'PASS: session decisions (live checks only).' : EQUIVALENCE ? 'PASS: session decisions (live equivalence check only).' : 'PASS: session decisions (offline mechanics).');
else {
  console.log(`FAILED: ${failures.length} check(s): ${failures.join('; ')}`);
  process.exitCode = 1;
}
