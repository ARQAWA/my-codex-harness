import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hook = path.join(root, 'hooks', 'lunatron.cjs');
const context = path.join(root, 'tools', 'context.cjs');
const capture = path.join(root, 'tools', 'capture.cjs');
const temp = mkdtempSync(path.join(os.tmpdir(), 'lunatron-test-'));
const pluginData = path.join(temp, 'plugin-data');
mkdirSync(pluginData, { recursive: true });

function invoke(fn, input) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hook)}).${fn}()`], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, PLUGIN_DATA: pluginData },
  });
}
function pack(input) {
  return spawnSync(process.execPath, [context], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}
function captureOutput(input) {
  return spawnSync(process.execPath, [capture], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, PLUGIN_DATA: pluginData },
  });
}
try {
  for (const model of ['gpt-5.6-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-5.6-luna', 'gpt-5.5', 'unrelated-model']) {
    const result = invoke('sessionStart', {
      hook_event_name: 'SessionStart', model, session_id: `default-${model}`,
      transcript_path: path.join(temp, 'unused-transcript.jsonl'),
      turn_id: 'unused-turn',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /LUNATRON_STATE=ACTIVE/);
    assert.match(result.stdout, /LUNATRON_MODE=default-on/);
    assert.doesNotMatch(result.stdout, /LUNATRON_COMMAND_APPLIED/);
    assert.match(result.stdout, /LUNATRON_DATA_PATHS/);
  }

  const forcedOn = invoke('userPromptSubmit', {
    hook_event_name: 'UserPromptSubmit', model: 'gpt-6-luna',
    session_id: 'mode-session', prompt: 'lnT1 Выполни задачу',
  });
  assert.equal(forcedOn.status, 0, forcedOn.stderr);
  assert.match(forcedOn.stdout, /LUNATRON_STATE=ACTIVE/);
  assert.match(forcedOn.stdout, /LUNATRON_MODE=forced-on/);
  assert.match(forcedOn.stdout, /LUNATRON_COMMAND_APPLIED=LNT1/);
  assert.match(forcedOn.stdout, /Active mode requires delegation/);
  assert.match(forcedOn.stdout, /absence\\nof parallel work does not waive this workflow/);
  assert.match(forcedOn.stdout, /Do not silently execute that block in Main/);
  assert.match(forcedOn.stdout, /carry out the rest of the user request/);
  assert.match(forcedOn.stdout, /Missing closure support does not prevent starting a worker/);
  assert.match(forcedOn.stdout, /Completion or interruption alone does not establish closure/);

  const childCommand = invoke('userPromptSubmit', {
    hook_event_name: 'UserPromptSubmit', model: 'gpt-5.6-luna',
    session_id: 'mode-session', agent_type: 'lunatik', prompt: 'LNT0',
  });
  assert.equal(childCommand.status, 0, childCommand.stderr);
  assert.match(childCommand.stdout, /LUNATRON_MODE=subagent/);
  assert.doesNotMatch(childCommand.stdout, /LUNATRON_COMMAND_APPLIED/);
  const resumed = invoke('sessionStart', {
    hook_event_name: 'SessionStart', model: 'gpt-6-astra', session_id: 'mode-session',
  });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /LUNATRON_MODE=forced-on/);

  const forcedOff = invoke('userPromptSubmit', {
    hook_event_name: 'UserPromptSubmit', model: 'gpt-6-astra',
    session_id: 'mode-session', prompt: 'Продолжай самостоятельно LNT0',
  });
  assert.equal(forcedOff.status, 0, forcedOff.stderr);
  assert.match(forcedOff.stdout, /LUNATRON_STATE=INACTIVE/);
  assert.match(forcedOff.stdout, /LUNATRON_MODE=forced-off/);
  assert.match(forcedOff.stdout, /stop all running subagents of this task/);
  assert.match(forcedOff.stdout, /Establish the state of interrupted changes/);
  assert.match(forcedOff.stdout, /carry out the rest of the user request/);
  assert.doesNotMatch(forcedOff.stdout, /LUNATRON_DATA_PATHS/);

  for (const [index, [prompt, expected]] of [
    ['LNT1', 1], ['lnt1 task', 1], ['task LnT1 next', 1], ['task LNT1', 1],
    ['\tLNT1\r\n', 1], ['```\nLNT1\n```', 1], ['LNT1 LNT0', 0], ['LNT0 LNT1', 1],
    ['LTN1', null], ['ltn 1', null], ['ltn -1', null], ['LNT 1', null],
    ['LNT-1', null], ['LNT2', null], ['XLNT1', null], ['LNT10', null],
    ['LNT1,', null], ['(LNT1)', null],
  ].entries()) {
    const result = invoke('userPromptSubmit', {
      hook_event_name: 'UserPromptSubmit', session_id: `command-${index}`, prompt,
    });
    assert.equal(result.status, 0, result.stderr);
    if (expected === null) {
      assert.match(result.stdout, /LUNATRON_MODE=default-on/);
      assert.doesNotMatch(result.stdout, /LUNATRON_COMMAND_APPLIED/);
    } else {
      assert.ok(result.stdout.includes(`LUNATRON_COMMAND_APPLIED=LNT${expected}`));
      assert.ok(result.stdout.includes(`LUNATRON_MODE=forced-${expected ? 'on' : 'off'}`));
      assert.equal(result.stdout.includes('stop all running subagents'), expected === 0);
    }
  }

  const source = path.join(temp, 'source.txt');
  writeFileSync(source, 'alpha\nbeta\n');
  const packed = pack({
    mode: 'pack', question: 'quote beta', sources: [{ path: source }],
    facts: [{ text: 'beta', references: [{ source: 0, start_line: 2, end_line: 2 }] }],
    errors: [], unknowns: [], outcome: { status: 'exit 0', changed_paths: [] },
  });
  assert.equal(packed.status, 0, packed.stderr);
  assert.match(packed.stdout, /beta/);
  assert.match(packed.stdout, /reported_outcome/);

  const searched = pack({
    mode: 'search', question: 'find beta', literal: 'beta',
    sources: [{ path: source }], before_lines: 1, after_lines: 0,
    max_results: 1,
  });
  assert.equal(searched.status, 0, searched.stderr);
  const searchResult = JSON.parse(searched.stdout);
  assert.equal(searchResult.returned_count, 1);
  assert.equal(searchResult.total_matches, 1);
  assert.equal(searchResult.omitted_count, 0);
  assert.equal(searchResult.matches[0].line, 2);
  assert.equal(searchResult.matches[0].start_char, 1);
  assert.equal(searchResult.continuation, null);

  const repeatedSource = path.join(temp, 'repeated.txt');
  writeFileSync(repeatedSource, 'x\nbeta\nbeta\n');
  const paged = pack({
    mode: 'search', question: 'page beta', literal: 'beta',
    sources: [{ path: repeatedSource }], max_results: 1,
  });
  assert.equal(paged.status, 0, paged.stderr);
  const page = JSON.parse(paged.stdout);
  assert.equal(page.omitted_count, 1);
  assert.deepEqual(page.continuation, {
    match_index: 1, source: 0, line: 3, start_char: 1,
  });

  const jsonSource = path.join(temp, 'source.json');
  writeFileSync(jsonSource, JSON.stringify({ empty: '', nil: null }));
  const emptyPointer = pack({
    mode: 'read', question: 'read empty',
    sources: [{ path: jsonSource, json_pointer: '/empty' }],
  });
  assert.equal(emptyPointer.status, 0, emptyPointer.stderr);
  assert.equal(JSON.parse(emptyPointer.stdout).sources[0].value_type, 'string');
  const nullPointer = pack({
    mode: 'read', question: 'read null',
    sources: [{ path: jsonSource, json_pointer: '/nil' }],
  });
  assert.equal(nullPointer.status, 0, nullPointer.stderr);
  assert.equal(JSON.parse(nullPointer.stdout).sources[0].value_type, 'null');

  const captured = captureOutput({
    executable: process.execPath,
    argv: ['-e', "process.stdout.write('out'); process.stderr.write('err')"],
    cwd: temp,
  });
  assert.equal(captured.status, 0, captured.stderr);
  const capturedResult = JSON.parse(captured.stdout);
  assert.equal(capturedResult.status, 'completed');
  assert.equal(capturedResult.completeness.overall, true);
  assert.equal(readFileSync(capturedResult.stdout_path, 'utf8'), 'out');
  assert.equal(readFileSync(capturedResult.stderr_path, 'utf8'), 'err');
  assert.equal(capturedResult.stdout_bytes, 3);
  assert.equal(capturedResult.stderr_bytes, 3);

  const launchFailure = captureOutput({
    executable: path.join(temp, 'missing-executable'), argv: [], cwd: temp,
  });
  assert.notEqual(launchFailure.status, 0);
  const failedCapture = JSON.parse(launchFailure.stdout);
  assert.equal(failedCapture.status, 'launch_error');
  assert.equal(failedCapture.completeness.overall, false);

  const invalidPack = pack({
    mode: 'pack', question: 'x', sources: [], facts: [], errors: [], unknowns: [],
  });
  assert.notEqual(invalidPack.status, 0);
  assert.match(invalidPack.stdout + invalidPack.stderr, /nonempty sources are required/);

  console.log('PASS: Lunatron routing, capture, and context tooling.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
