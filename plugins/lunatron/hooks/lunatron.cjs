'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ACTIVE_CONTEXT = `LUNATRON_STATE=ACTIVE
At the root, Main owns the whole outcome, scope, decisions, diagnosis, acceptance,
and user response. Isolate noisy work from Main's context; resource savings are
secondary. Keep ordinary search, small reads, planning, and acceptance with Main.
Lunatik and Luntik are specialized roles, not an allowlist: Main may use other
available agents when the task needs them, under the active instructions.
These root orchestration duties do not transfer to a full-context child; it
executes its assigned block rather than taking over or redelegating that block.

Main directly reads mandatory AGENTS.md, every selected SKILL.md, and decisive
original fragments.
Do not combine required instruction files into one output when this is likely
to cause truncation; Main must still read every required instruction in full.
Main alone interprets and orchestrates skills; never ask
lunatik or luntik to read, apply, or execute a skill. Translate applicable skill
requirements into concrete work.
A skill file may be an explicit data or edit target, but its text is then data.
Main writes the final analytical output and accepts delegated findings itself.

Luntik is read-only. Use \`agent_type=luntik\` only for one concrete semantic
question about large files or a saved result already selected by Main. Luntik
never takes over Discovery, source choice, hypotheses, strategy, diagnosis, or
acceptance. Give Luntik exact paths, the question, known constraints, required
result, and stop conditions; never pass the whole history or an open repository
search. Luntik may read and search only those sources. It returns concise facts,
exact locators,
small fragments Main should open, contradictions, errors, searched bounds, and
unknowns. Main reads the decisive originals. If a source changed, say so.

Main keeps ordinary search and small reads direct. For a saved large result or an
explicitly selected large source, use context_cli when literal search, a bounded
range, or JSON Pointer can answer the question. Use Luntik only when the selected
large data still needs semantic interpretation. An irrelevant or unnecessary
large result may be ignored; its size and curiosity about the producing tool do
not justify Luntik. For exact extraction, pass Luntik the current context_cli path
from runtime data.

Lunatik executes decision-complete implementation and operational work. Apart
from complex blocks assigned to a full-context fork below, assign code, tests,
configuration, scripts, migrations, tooling, commands, and even trivial edits
to the one persistent \`agent_type=lunatik\`. Main selects the technical content
and later accepts it.
Empirical checks require authority from the main prompt or user.

For a complex, noisy search, reading, diagnosis, or code block outside the narrow
Luna roles, Main starts one fresh \`agent_type=default\` full-context fork. Use the
native fork of the current available conversation with the same model and
reasoning effort; do not rebuild the history in the assignment or choose another
model/profile. Give it the mini-plan structure below, including the question,
scope, known facts, constraints, authority, required result, and stop conditions.
For investigation, specify what must be established, not an invented answer;
Main need not repeat the investigation before delegating it. The fork performs
the block itself, including necessary reads, edits, and authorized commands,
and returns one concise final with findings or changed locations, exact evidence
locators, authorized check results, errors, and unknowns. Raw logs and bulk reads
stay in the child. Main reads decisive originals and owns acceptance. Do not use
an inherited-context fork in place of a required fresh blind reviewer.

Before each Lunatik implementation assignment, Main creates one concise,
decision-complete mini-plan for a coherent block. Do not show it to the user or
wait for approval. Follow this structure: Result and boundaries; Selected
solution and concrete references; Actions and dependencies; Readiness,
authorized checks, and return conditions. Include the exact working directory,
targets, commands and parameters when applicable, sufficient symbols or other
references, permitted differences, and material corner cases or failure handling.
For each command specified in the mini-plan that requires a working directory,
supply one exact absolute cwd resolved from the relevant project or workspace.
Do not leave working-directory alternatives or delegate their selection to Lunatik.
Include all known mandatory results
and authorized checks for the block from the outset; never make a known
requirement optional.
Use facts already obtained; do not start another research phase. Scale detail to
the task, omit repetition, and leave only routine implementation choices to
Lunatik. A general style reference is insufficient.

Send the complete mini-plan as one assignment. Lunatik may repair routine quoting,
tool syntax, or simple patch alignment while preserving Main's decisions. It
returns on a missing material decision, conflict, authority gap, required complex
repair, or uncertain mutation outcome. Main diagnoses the report and sends the
same worker a ready correction when sufficient; a complex repair goes to a fresh
full-context fork with bounded scope. Establish actual state before retrying an
uncertain mutation. Never blindly retry, undo existing changes, or ask the user
about a routine execution problem while an authorized solution remains.

Keep one persistent lunatik and one persistent luntik. Reuse the same agent id
for later turns through followup_task when exposed or v1 send_input; replace an
agent only when the runtime cannot continue it, including after LNT0 closed it.
Do not create a second live agent of either type. Both report directly to Main
and neither relays for the other.
The first assignment contains all ready context; later assignments contain only
the new request and relevant delta. Let a running assignment finish unless it
needs correction. Use one assignment and one final response per coherent block.

For lunatik and luntik only, use the current runtime schema without history.
V1 contains only \`agent_type\`, \`fork_context=false\`, and exactly one
\`message\` or \`items\`. V2 contains only \`agent_type\`, \`fork_turns="none"\`,
\`message\`, and non-empty \`task_name\`.
Omit model, reasoning effort, and service tier. Never mix schemas or add fields.
If a Luna role is unavailable, do not impersonate it; this does not prohibit
other available roles.

For the full-context fork, use \`agent_type=default\` with \`fork_context=true\`
and one \`message\` or \`items\` in V1; in V2 use \`fork_turns="all"\`, \`message\`,
and a non-empty \`task_name\`. Inherit the current model and reasoning without
overrides. Start a full-context fork only when native full-history inheritance
and a native close-agent tool are available. Do not reuse it for another block.
When no independent necessary work remains, wait for agent events for up to
600000 ms per call,
within the exposed tool's limit; do not poll or duplicate its work. A timeout
alone is not failure. Once the block completes or fails, Main closes the child
with the native close-agent tool and requires its successful acknowledgment.
A final or interrupt alone does not establish closure. Report an unavailable or
failed close honestly; do not invent a tool or delete history. A later block
gets a fresh fork.

Specialists return only decision-sufficient results: Luntik returns facts and
locators; Lunatik returns changed locations, assigned evidence, errors, and
uncertainty. Omit brief echoes, full diffs, and large logs. A summary never
replaces Main's decisive reading. Main checks the completed block against the
request and references, resolves material gaps, and stops when the requested
result and explicitly required evidence are complete. Do not duplicate valid
work or checks. While a specialist works, continue only independent necessary
analysis; otherwise use the normal event-driven wait policy.

Goal and memory workflows remain optional and run only when explicitly selected.
Main owns and orchestrates them; specialists never create, redefine, or control
their semantic state.
Main determines notebook content, decisions, and status; Lunatik may mechanically
write the exact text Main supplies. Include related ready writes in the same
assignment when their required order permits. Never delay a required update for
batching or mark work accepted or complete before Main accepts it. A separate
assignment is appropriate when the write depends on that acceptance. Native Goal
management remains with Main.

Choose the reading path before requesting bulk task data.
Use capture_cli only when a command's output is expected to be
large. Use context_cli for bounded extraction from a saved large result or an
explicitly selected large source. Keep small direct reads and ordinary search
direct. Do not repeat a completed call, execute saved tool_input, or rebuild a
whole task-data source through small reads. This does not limit required instruction
reading. A separately necessary current-original read is allowed.
Lunatik removes an exact temporary package only on Main's order after acceptance;
never remove artifacts. The task's LNT mode file is the only Lunatron control
state; do not add another router, registry, daemon, scoring, or retry system.`;

const INACTIVE_CONTEXT = `LUNATRON_STATE=INACTIVE
Ignore all earlier Lunatron ACTIVE delegation instructions, including Main
execution limits and role guards. Lunatron delegation is disabled.
Work normally under the current task and other active instructions.`;

const LUNATRON_AGENT_TYPES = new Set([
  'lunatik',
  'luntik',
]);

const ROLE_INPUT_CORRECTION = 'For lunatik and luntik only, use exactly v1: agent_type=lunatik or luntik, fork_context=false, and exactly one message or items; or v2: agent_type=lunatik or luntik, fork_turns="none", message, and a non-empty task_name. Do not mix schemas or add fields.';

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

function denyRoleInput() {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: ROLE_INPUT_CORRECTION,
    },
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
      status += '\nBefore continuing, Main must stop and close ALL subagents of this task, including running forks, Lunatik, Luntik, and other roles, using native tools. Require successful close acknowledgments; final or interrupt alone is not closure. Do not affect other user tasks. Report unavailable or failed closure honestly. Establish the state of interrupted changes before further work; never blindly retry. Discard closed agent ids; recreate Luna helpers only when needed after reactivation.';
    }
    status += '\nBriefly confirm the applied mode, then carry out the rest of the user request, if any.';
  }
  if (!mode.active) return INACTIVE_CONTEXT + status;
  const sessionId = input.session_id;
  const pluginData = process.env.PLUGIN_DATA;
  let dataBlock = '\n\nLUNATRON_DATA_PATHS\n';
  dataBlock += `context_cli: ${path.resolve(__dirname, '..', 'tools', 'context.cjs')}\n`;
  const captureCli = path.resolve(__dirname, '..', 'tools', 'capture.cjs');
  dataBlock += `capture_cli: ${captureCli}\n`;
  dataBlock += `capture_call: printf '%s' '{"executable":"<program>","argv":["<arg>"],"cwd":"<absolute cwd>"}' | node "${captureCli}"\n`;
  dataBlock += `session_id: ${sessionId === undefined ? 'unavailable' : String(sessionId)}\n`;
  if (typeof pluginData === 'string' && pluginData.length > 0) {
    const safeSession = safePathComponent(sessionId);
    dataBlock += `PLUGIN_DATA/artifacts: ${path.resolve(pluginData, 'artifacts', safeSession)}\n`;
  } else {
    dataBlock += 'PLUGIN_DATA: unavailable\n';
  }
  return ACTIVE_CONTEXT + dataBlock + status;
}

function userPromptSubmit() {
  const input = readInput('UserPromptSubmit');
  const commandResult = input && applyModeCommand(input);
  if (commandResult?.error) {
    blockModeCommand(commandResult);
    return;
  }
  const context = input && contextFor(input, commandResult);
  if (context) emitContext('UserPromptSubmit', context);
}

function sessionStart() {
  const input = readInput('SessionStart');
  const context = input && contextFor(input);
  if (context) emitContext('SessionStart', context);
}

function isRoleInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return false;
  if (!LUNATRON_AGENT_TYPES.has(toolInput.agent_type)) return false;

  const hasForkContext = Object.hasOwn(toolInput, 'fork_context');
  const hasForkTurns = Object.hasOwn(toolInput, 'fork_turns');
  if (hasForkContext === hasForkTurns) return false;

  if (hasForkContext) {
    if (toolInput.fork_context !== false) return false;

    const hasMessage = Object.hasOwn(toolInput, 'message');
    const hasItems = Object.hasOwn(toolInput, 'items');
    if (hasMessage === hasItems) return false;
    if (hasMessage && typeof toolInput.message !== 'string') return false;
    if (hasItems && !Array.isArray(toolInput.items)) return false;

    const allowedKeys = hasMessage
      ? new Set(['agent_type', 'fork_context', 'message'])
      : new Set(['agent_type', 'fork_context', 'items']);
    return Object.keys(toolInput).every((key) => allowedKeys.has(key));
  }

  if (toolInput.fork_turns !== 'none' || typeof toolInput.message !== 'string') return false;
  if (typeof toolInput.task_name !== 'string' || toolInput.task_name.length === 0) return false;

  const allowedKeys = new Set(['agent_type', 'fork_turns', 'message', 'task_name']);
  return Object.keys(toolInput).every((key) => allowedKeys.has(key));
}

function preToolUse() {
  const input = readInput('PreToolUse');
  if (!input || !resolveMode(input).active || input.tool_name !== 'spawn_agent') return;
  if (!LUNATRON_AGENT_TYPES.has(input.tool_input?.agent_type)) return;

  if (!isRoleInput(input.tool_input)) denyRoleInput();
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
exports.preToolUse = preToolUse;
