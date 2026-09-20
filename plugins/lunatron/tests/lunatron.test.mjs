import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
function filesBelow(dir) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(full));
    else result.push(full);
  }
  return result;
}

try {
  for (const model of ['gpt-5.6-sol', 'gpt-6-astra']) {
    const result = invoke('sessionStart', {
      hook_event_name: 'SessionStart', model, session_id: `session-${model}`,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /LUNATRON_STATE=ACTIVE/);
  }

  for (const model of ['gpt-5.5', 'gpt-5.6-terra', 'unrelated-model']) {
    const result = invoke('sessionStart', {
      hook_event_name: 'SessionStart', model, session_id: `inactive-${model}`,
      transcript_path: path.join(temp, 'unused-transcript.jsonl'),
      turn_id: 'unused-turn',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /LUNATRON_STATE=INACTIVE/);
  }

  const validSpawn = invoke('preToolUse', {
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.6-sol',
    session_id: 'valid-spawn',
    tool_name: 'spawn_agent',
    tool_input: {
      agent_type: 'lunatik', fork_turns: 'none', message: 'do work', task_name: 'test',
    },
  });
  assert.equal(validSpawn.status, 0, validSpawn.stderr);
  assert.equal(validSpawn.stdout, '');

  const invalidSpawn = invoke('preToolUse', {
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.6-sol',
    session_id: 'invalid-spawn',
    tool_name: 'spawn_agent',
    tool_input: {
      agent_type: 'lunatik', fork_turns: 'none', message: 'do work', task_name: 'test', extra: true,
    },
  });
  assert.equal(invalidSpawn.status, 0, invalidSpawn.stderr);
  assert.match(invalidSpawn.stdout, /"permissionDecision":"deny"/);

  const small = invoke('postToolUse', {
    hook_event_name: 'PostToolUse', model: 'gpt-5.6-sol',
    session_id: 'small', tool_use_id: 'small-tool', tool_name: 'exec',
    tool_response: { status: 'ok', output: 'small' },
  });
  assert.equal(small.status, 0, small.stderr);
  assert.equal(small.stdout, '');

  const large = invoke('postToolUse', {
    hook_event_name: 'PostToolUse', model: 'gpt-5.6-sol',
    session_id: 'large', tool_use_id: 'large-tool', tool_name: 'exec',
    tool_response: { status: 'ok', output: 'X'.repeat(9000) },
  });
  assert.equal(large.status, 0, large.stderr);
  assert.match(large.stdout, /"continue":false/);
  assert.doesNotMatch(large.stdout, /"decision":"block"/);
  assert.match(large.stdout, /completeness=complete_as_received/);
  const packages = filesBelow(pluginData).filter(file => file.endsWith('.json'));
  assert.equal(packages.length, 1);
  assert.equal(JSON.parse(readFileSync(packages[0], 'utf8')).tool_name, 'exec');

  const terraLargeWhileOff = invoke('postToolUse', {
    hook_event_name: 'PostToolUse', model: 'gpt-5.6-terra',
    session_id: 'terra-off', tool_use_id: 'terra-tool', tool_name: 'exec',
    tool_response: { status: 'ok', output: 'T'.repeat(9000), original_token_count: 9001 },
  });
  assert.equal(terraLargeWhileOff.status, 0, terraLargeWhileOff.stderr);
  assert.match(terraLargeWhileOff.stdout, /"continue":false/);
  assert.match(terraLargeWhileOff.stdout, /completeness=incomplete/);

  const lunaLarge = invoke('postToolUse', {
    hook_event_name: 'PostToolUse', model: 'gpt-5.6-luna',
    session_id: 'luna', tool_use_id: 'luna-tool', tool_name: 'exec',
    tool_response: { status: 'ok', output: 'L'.repeat(9000) },
  });
  assert.equal(lunaLarge.status, 0, lunaLarge.stderr);
  assert.equal(lunaLarge.stdout, '');

  const subagentLarge = invoke('postToolUse', {
    hook_event_name: 'PostToolUse', model: 'gpt-5.6-sol', agent_type: 'lunatik',
    session_id: 'child', tool_use_id: 'child-tool', tool_name: 'exec',
    tool_response: { status: 'ok', output: 'C'.repeat(9000) },
  });
  assert.equal(subagentLarge.status, 0, subagentLarge.stderr);
  assert.equal(subagentLarge.stdout, '');

  const forcedOn = invoke('userPromptSubmit', {
    hook_event_name: 'UserPromptSubmit', model: 'gpt-5.6-terra',
    session_id: 'mode-session', prompt: '  ltn 1  ',
  });
  assert.equal(forcedOn.status, 0, forcedOn.stderr);
  assert.match(forcedOn.stdout, /LUNATRON_STATE=ACTIVE/);
  assert.match(forcedOn.stdout, /LUNATRON_MODE=forced-on/);

  const forcedOff = invoke('userPromptSubmit', {
    hook_event_name: 'UserPromptSubmit', model: 'gpt-6-astra',
    session_id: 'mode-session', prompt: 'ltn 0',
  });
  assert.equal(forcedOff.status, 0, forcedOff.stderr);
  assert.match(forcedOff.stdout, /LUNATRON_STATE=INACTIVE/);
  assert.match(forcedOff.stdout, /LUNATRON_MODE=forced-off/);

  const forcedOffLarge = invoke('postToolUse', {
    hook_event_name: 'PostToolUse', model: 'gpt-6-astra',
    session_id: 'mode-session', tool_use_id: 'forced-off-tool', tool_name: 'exec',
    tool_response: { status: 'ok', output: 'F'.repeat(9000) },
  });
  assert.equal(forcedOffLarge.status, 0, forcedOffLarge.stderr);
  assert.match(forcedOffLarge.stdout, /"continue":false/);

  const automatic = invoke('userPromptSubmit', {
    hook_event_name: 'UserPromptSubmit', model: 'gpt-5.6-terra',
    session_id: 'mode-session', prompt: 'ltn -1',
  });
  assert.equal(automatic.status, 0, automatic.stderr);
  assert.match(automatic.stdout, /LUNATRON_STATE=INACTIVE/);
  assert.match(automatic.stdout, /LUNATRON_MODE=automatic-off/);

  const mention = invoke('userPromptSubmit', {
    hook_event_name: 'UserPromptSubmit', model: 'gpt-5.6-terra',
    session_id: 'mention-session', prompt: 'example: ltn 1',
  });
  assert.equal(mention.status, 0, mention.stderr);
  assert.match(mention.stdout, /LUNATRON_MODE=automatic-off/);

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

  console.log('PASS: Lunatron routing, delegation gates, output guard, capture, and context tooling.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
