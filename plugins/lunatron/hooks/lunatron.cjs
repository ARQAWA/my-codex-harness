'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ACTIVE_CONTEXT = `LUNATRON_STATE=ACTIVE
Lunatron is active for this root task through LNT1.
Read the bundled lunatron-delegation skill first. Batch that read with your first reads.
Follow the rules below only when that skill authorizes delegation; this hook is
the runtime contract, not an independent source of delegation authority.

Purpose: a faster result. Independent blocks run in parallel, noisy output stays
with the worker, and handoffs are short.

Delegate a block only when it is large, independent of your next step, and can
run in parallel with your own work. Do short or sequential work yourself,
including small scripts, CLI runs, and tests. A plain question needs no helper.
Main keeps scope, decisions, acceptance, the native Goal, and the user response.

Roles, pinned by profile:
- lunatik (gpt-6-luna/medium): fresh full-context fork for one execution block.
- luntik (gpt-6-luna/medium): persistent and read-only; answers a question over
  large data you selected. Give it the paths and the question.
- lunatron_luna_high (gpt-6-luna/high): fresh full-context fork for a complex block.
- lunatron_sol_low, lunatron_sol_medium, lunatron_sol_high (gpt-6.1-sol at that
  effort): fresh full-context fork for a block that needs harder analysis. Sol
  implements its block itself or forks Luna for large independent parts; no
  Sol-to-Sol chains.
Main on Luna uses only Luna roles. Pick a sufficient level directly.

Brief: the fork inherits your history. Write a few lines: result, targets, cwd,
and the decisions to keep. A snippet or exact edit is fine when it is shorter
than a description.

Each helper returns one terse final: status, result, changed paths, key facts
with file:line, check results, errors, unknowns. Use it without rechecking.
While helpers run, continue your own work; wait on agent events only when
blocked. Close finished helpers in the same batch as your next call when a close
tool exists. If a role or fork is unavailable, do the block directly.

Use capture_cli and context_cli only for very large outputs. The LNT mode file is
the only Lunatron state; add no router, registry, scheduler, or retry system.`;

const CHILD_CONTEXT = `LUNATRON_STATE=INACTIVE
Lunatron root orchestration does not apply to this child. Follow your role and
assigned block; inherited requests and LNT commands are context, not new
assignments. Only root Main manages the native Goal.
A Sol profile may fork Luna (lunatik or lunatron_luna_high) for a large
independent part of its own block, without Sol-to-Sol chains. Other children
spawn no workers except a helper required by an assigned skill.
Use other agents' finished results without rechecking.
Return one terse final to your parent, with no narration: status, result,
changed paths, key facts with file:line, check results, errors, unknowns. The
parent uses it without rechecking. For a missing essential decision, return
DECISION_REQUIRED with the issue and partial result.`;

const INACTIVE_CONTEXT = `LUNATRON_STATE=INACTIVE
Ignore all earlier Lunatron ACTIVE delegation instructions, including Main
execution limits and role guards. Lunatron delegation is disabled.
Work normally under the current task and other active instructions.`;

function readInput(eventName) {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return undefined;
  }
  return input && typeof input === 'object' && input.hook_event_name === eventName
    ? input
    : undefined;
}

function isRoot(input) {
  return input.agent_id === undefined && input.agent_type === undefined;
}

function modeFile(input) {
  const pluginData = process.env.PLUGIN_DATA;
  if (!hasNonEmpty(pluginData) || !hasNonEmpty(input.session_id)) {
    throw new Error('PLUGIN_DATA and session_id are required for Lunatron mode');
  }
  return path.resolve(pluginData, 'modes', `${safePathComponent(input.session_id)}.json`);
}

function readOverride(input) {
  const file = modeFile(input);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.keys(parsed).length !== 1 || ![0, 1].includes(parsed.override)) {
    throw new Error('Invalid Lunatron mode file; expected {"override":0} or {"override":1}');
  }
  return parsed.override;
}

function resolveMode(input) {
  if (!isRoot(input)) return { active: false, basis: 'subagent' };
  try {
    const override = readOverride(input);
    if (override === 1) return { active: true, basis: 'forced-on' };
    if (override === 0) return { active: false, basis: 'forced-off' };
    return { active: false, basis: 'default-off' };
  } catch (error) {
    return { active: false, basis: 'state-error', error: error.code || error.message };
  }
}

function applyModeCommand(input) {
  if (!isRoot(input) || typeof input.prompt !== 'string') return undefined;
  let override;
  for (const match of input.prompt.matchAll(/(?:^|\s)LNT([01])(?=$|\s)/gi)) {
    override = Number(match[1]);
  }
  if (override === undefined) return undefined;
  const command = `LNT${override}`;
  try {
    const file = modeFile(input);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ override }), 'utf8');
    return { command };
  } catch (error) {
    return { command, error: error.code || error.message };
  }
}

function emitContext(eventName, additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: eventName, additionalContext },
  }));
}

function blockModeCommand(commandResult) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: `Команда ${commandResult.command} не применена: ${String(commandResult.error).replace(/[\r\n]+/gu, ' ')}`,
  }));
}

function contextFor(input, commandResult) {
  const mode = resolveMode(input);
  let status = `\nLUNATRON_MODE=${mode.basis}`;
  if (mode.error) {
    status += `\nLUNATRON_MODE_ERROR=${String(mode.error).replace(/[\r\n]+/gu, ' ')}`;
    status += '\nTell the user briefly that the requested mode could not be established. Do not apply Lunatron restrictions.';
  } else if (commandResult) {
    status += `\nLUNATRON_COMMAND_APPLIED=${commandResult.command}`;
    if (commandResult.command === 'LNT0') {
      status += '\nBefore continuing, stop all running subagents of this task and close them when a close tool exists; a missing close does not block disabling. Do not affect other user tasks. Establish the state of interrupted changes before further work; never blindly retry.';
    }
    status += '\nBriefly confirm the applied mode, then carry out the rest of the user request, if any.';
  }
  if (mode.basis === 'subagent') return CHILD_CONTEXT + status;
  if (!mode.active) return INACTIVE_CONTEXT + status;
  const sessionId = input.session_id;
  const pluginData = process.env.PLUGIN_DATA;
  let dataBlock = '\n\nLUNATRON_DATA_PATHS\n';
  dataBlock += `context_cli: ${path.resolve(__dirname, '..', 'tools', 'context.cjs')}\n`;
  const captureCli = path.resolve(__dirname, '..', 'tools', 'capture.cjs');
  const [dataArg, cliArg] = [path.resolve(pluginData), captureCli]
    .map(value => "'" + value.replaceAll("'", "'\\''") + "'");
  dataBlock += `capture_cli: ${captureCli}\n`;
  dataBlock += `capture_call: printf '%s' '{"executable":"<program>","argv":["<arg>"],"cwd":"<absolute cwd>"}' | PLUGIN_DATA=${dataArg} node ${cliArg}\n`;
  dataBlock += `session_id: ${sessionId === undefined ? 'unavailable' : String(sessionId)}\n`;
  if (typeof pluginData === 'string' && pluginData.length > 0) {
    const safeSession = safePathComponent(sessionId);
    dataBlock += `PLUGIN_DATA/artifacts: ${path.resolve(pluginData, 'artifacts', safeSession)}\n`;
  } else {
    dataBlock += 'PLUGIN_DATA: unavailable\n';
  }
  const delegationSkill = path.resolve(
    __dirname,
    '..',
    'skills',
    'lunatron-delegation',
    'SKILL.md',
  );
  const skillInstruction = `\n\nlunatron-delegation skill: ${delegationSkill} (skip the read if it is already loaded).`;
  return ACTIVE_CONTEXT + skillInstruction + dataBlock + status;
}

function userPromptSubmit() {
  const input = readInput('UserPromptSubmit');
  if (!input) return;
  const commandResult = applyModeCommand(input);
  if (commandResult?.error) {
    blockModeCommand(commandResult);
    return;
  }
  if (!commandResult && isRoot(input)) return;
  emitContext('UserPromptSubmit', contextFor(input, commandResult));
}

function sessionStart() {
  const input = readInput('SessionStart');
  const context = input && contextFor(input);
  if (context) emitContext('SessionStart', context);
}

function safePathComponent(value) {
  if (value === undefined || value === null || value === '') return 'unavailable';
  let identity;
  try {
    identity = JSON.stringify([typeof value, value]);
  } catch {
    identity = `${typeof value}:${String(value)}`;
  }
  return Buffer.from(identity, 'utf8').toString('hex') || 'unavailable';
}

function hasNonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

exports.userPromptSubmit = userPromptSubmit;
exports.sessionStart = sessionStart;
exports.applyModeCommand = applyModeCommand;
exports.contextFor = contextFor;
