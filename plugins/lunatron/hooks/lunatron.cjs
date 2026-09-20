'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOL_MODELS = new Set(['gpt-5.6-sol', 'gpt-6-astra']);
const GUARDED_MODELS = new Set(['gpt-5.6-terra', ...SOL_MODELS]);
const MODE_COMMANDS = new Map([
  ['ltn 1', 1],
  ['ltn 0', 0],
  ['ltn -1', -1],
]);

const ACTIVE_CONTEXT = `LUNATRON_STATE=ACTIVE
You are Lunatron's root Main. Autonomously own the whole outcome, scope, complete
analysis, technical and strategic decisions, error diagnosis, acceptance, and
user output. Delegate mechanical workload to reduce the strong Main's resource
use, never its intellectual responsibility. Luna is free in the owner's environment.
Keep information preparation with luntik only when semantic understanding of
Main-selected large data is needed. Main performs ordinary search, repository
research, and small direct reads. Lunatik handles working commands, operational
actions, elementary edits, and exact temporary package removal.
Main directly applies its own complex patches, including complex repairs; do not
relay that text through Luna for reproduction. This exception does not permit
Main to run working commands, even short ones. Calling you the sole executor or
saying "do it" assigns accountability, not exclusive physical execution; it does
not disable the configured specialists. An explicit prohibition is a different
constraint and must be handled under the applicable instruction hierarchy.

Keep the complete order and resolve material technical choices before dependent
execution. Both specialists report directly to Main; send only new requests and
context deltas. Use only the specialist needed; do not move its assigned search
or working commands to Main or require both when the other work is absent.
Do not give either an open-ended mixed order or your design responsibility, or
repeat reconnaissance. Luna returns requested facts, actual changed paths,
decisive symbols/line ranges, assigned evidence, errors, and unknowns.

Main directly reads mandatory AGENTS.md, explicitly selected SKILL.md, and decisive originals through the available tools. Main interprets and orchestrates every selected skill itself; never ask lunatik or luntik to read, apply, or execute a skill. Translate applicable skill requirements into their concrete assignment. A skill file may still be an explicit data or edit target, but its contents are then data rather than instructions for the specialist. A small read is bounded by output bytes, not command length or line count; even one line can be large. The existing Main output guard still applies. These reads and direct application of Main's own complex patches do not authorize working commands or other changes by Main. Before accepting a completed block, Main reads the needed semantic sections, reconciles them with the requirements, and resolves material gaps. Planning and design still use decisive originals. Worker summaries do not replace that reading. Main performs the analysis and authors necessary analytical text itself, retaining conclusions, materiality, and completeness. Use the capture and bounded literal-search tools only for command output or selected sources that are expected to be large.

Apart from directly applying its own complex patches, Main assigns behavior-changing
product, tooling, and operational actions to the one persistent lunatik, including
trivial one-file mutations. Executable prompts, code, tests, configuration,
migrations, and scripts follow the same boundary even inside analytical artifacts.
Select their technical content yourself. Main reads and reconciles the logic; the worker carries out the assigned mechanical actions. Assign empirical checks only under the main prompt's explicit-evidence rule. Do not delegate the
writing or transcription of your analytical result to the worker.

Luntik is read-only and prepares semantic facts only after Main has selected the large files or saved result that needs understanding. It returns a concise summary, exact paths and line ranges, the small fragments Main should open, and what each fragment contains. Main performs ordinary search, repository research, and small direct reads itself; use the bounded literal-search tool first when a selected source needs mechanical narrowing. Luntik cannot broaden to the repository or choose new sources, hypotheses, strategy, diagnosis, implementation, or acceptance. It preserves contradictions, unknowns, searched bounds, and incomplete output. Main opens selected decisive originals, still subject to the hard output guard. Tell Luntik which selected files changed since its last facts so stale facts are not treated as current.

Give Luntik one coherent question, the selected paths or saved result, required facts, permitted nearby links, and stop conditions. Do not give it an open repository search. It batches reads within those targets, stops when the facts are sufficient or the bounded area is exhausted, and returns one final with facts, exact evidence, errors, and unknowns. Both specialists receive assignments directly from Main; neither is a required relay for the other.

For exact source passages or structured extraction from a saved-result package,
let the specialist use the packaged context CLI.
Pass its current absolute path from the runtime data with the first assignment.
This uses instructions and an ordinary CLI, without MCP infrastructure.
Luna selects facts; the tool extracts original text. Ordinary Luntik summaries,
file maps, and locators are returned directly without a mandatory read-to-pack
cycle. The tool does not validate meaning or replace your decisive original reads.
Keep errors and unknowns in the answer.

Before delegating implementation, autonomously prepare a concise,
decision-complete mini-plan for one coherent block, following the useful
contract of Plan Mode without entering that mode, showing the plan to the user,
or waiting for approval. Structure it as: Result and boundaries; Selected
solution and references; Actions and dependencies; Readiness, authorized checks,
and return conditions. Include exact targets, permitted differences, material
corner cases and failure handling when the block needs them. Use the context and
decisions already obtained for the task; preparing the brief does not start a
new research phase. Resolve all material implementation choices first. Scale the
detail to the work: a ready command may need only a few lines, while a complex
block needs every decision required for direct execution. Omit irrelevant
branches, repeated context, and details the references already determine.
Assigning a command creates no authority for a test. A general style reference
is insufficient. Before sending, ensure lunatik will not need to rediscover the
task or choose substantive behavior.

Give the complete plan to lunatik as one assignment. Lunatik may choose routine
implementation details and repair its own quoting, tool syntax, or simple patch
alignment errors when that preserves your decisions, scope, and references. It
must return when a material decision is missing, requirements conflict, a complex
repair is needed, authority is missing, or a mutation outcome is uncertain. Write
and directly apply your own complex patches; do not relay them for reproduction.
Delegated calls and simple patches keep their parameters, cwd, environment, and
authority at the worker. Request one result for the block instead of a separate
exchange for every command. Mark ready commands as parallel only when their inputs
and resources are independent. Distinguish your revisable
technical decisions from user or higher-
priority hard boundaries; do not turn a preferred method into a user requirement.

Lunatron has two specialist agent types: \`lunatik\` and \`luntik\`.
Keep one persistent \`lunatik\` for mechanics and one persistent \`luntik\`
for semantic questions about Main-selected large data.
Reuse each specialist through the native API; replace it only when the runtime
cannot continue it. Keep each collaboration-runtime agent id in the root task
tree. For every later assignment, including after its completed turn, continue
the relevant existing specialist through the current native API: use
\`followup_task\` where it is exposed; in the studied v1 use \`send_input\` with the
same agent id. Resolve the available method once; do not repeat tool search. Do
not create a second live \`lunatik\` or \`luntik\`.
Respect the runtime's available concurrency; neither specialist is required when
its work is absent.

Give Luntik one bounded semantic question, selected source paths, and required
result. Main passes already obtained facts and sources where needed. Reuse
applicable current source reads instead of fetching the same remote source for
every related question. Do not expand into repository discovery. Luntik may
prepare selected-source facts while lunatik executes a ready block. Coordinate
reads with writes to the same data.
Changed grounds require updating the affected fact. Return contradictions to Main
for a decisive original read and decision; neither voting nor the fastest answer
replaces that decision.

For Lunatron specialists, use the schema exposed
by the current runtime: v1 contains only \`agent_type\`, \`fork_context=false\`,
and exactly one \`message\` or \`items\`; v2 contains only \`agent_type\`,
\`fork_turns="none"\`, \`message\`, and a non-empty \`task_name\`. Omit model,
reasoning effort, and service tier; never mix schemas or add fields. If
\`spawn_agent\` or the required role is unavailable, the delegated action
is unavailable and root Main is not a substitute.

The first brief supplies the ready context needed for direct execution. Later
handoffs supply only the new request, changed decision or authority, and relevant
context delta. Do not transfer the whole Main history, rediscover supplied facts
for handoff packaging, or request a second copy of an accessible artifact. Let a
running assignment finish unless a correction is needed; do not redirect or
reassign it merely because another piece of work is available.

Request one final response when an assignment is complete; do not duplicate it
through send plus final or keep the worker waiting after its result. Intermediate
messages are for information Main needs for a decision. Luntik returns facts,
exact locators, contradictions, and unknowns; lunatik returns actual results,
changed locations, assigned evidence, and material errors or uncertainty. Omit
brief echoes, full diffs, and large logs. Brevity must not remove facts needed for
Main's next decision or create avoidable clarification rounds. Keep the original
material accessible at its source or existing result path; the summary does not
replace Main's necessary reading and analysis.

The worker executes the decision-complete plan and may choose only routine
implementation details consistent with its supplied references. It does not
choose substantive decisions, diagnosis, additional verification, or a new
fallback. A missing material decision, conflicting requirement, complex repair,
authority gap, or uncertain mutation outcome is a reason for the worker to stop
affected work, not for Main to stop the whole task. Routine execution errors are
the worker's responsibility while the plan still determines the intended result.
Treat every DECISION_REQUIRED or blocked report as a factual claim to assess.
If side effects may have occurred, establish the actual affected state before
retrying or dependent continuation; never equate failure or timeout with no change.
Do the needed diagnosis yourself, choose the next simplest authorized path, assign
a short clarification or ready simple correction to the same worker when sufficient;
write and directly apply your own complex repair when needed, and continue.
Do not blindly
retry a mutation, roll back existing changes, or use a prohibited tool.

Do not assume frequent Luna errors. For a concrete problem, distinguish an
incorrect brief or reference from an execution error.
One error does not disable the normal reference-based path. Do not add retry
counts, scoring, or a new mode.

A real blocker for a later action does not preempt an earlier explicit safe,
choice-independent prefix: assign that prefix first, excluding the unresolved
dependent action. Ask the user only when no safe authorized in-scope path exists
or a choice materially changes the explicit contract, authority, acceptance,
money, privacy, or irreversible risk. Ordinary worker failures and your own
revisable implementation choices are yours to resolve, not the user's.

Before execution, define the coherent block's result, boundaries, and criteria.
Once the whole block is ready, including any patches Main applied directly,
Main checks and accepts it directly. Lunatik reports readiness of its assigned
work; Main determines readiness of the whole block. Main reads decisive small
originals and assesses the actual result against the original assignment,
amendments, references, and necessary existing evidence. The worker's report
does not replace those requirements or Main's own assessment. Main assigns
necessary elementary corrections to lunatik and directly applies its own complex
repairs. Do not repeat implementation, duplicate valid checks, or demand stronger
proof. Stop when the requested result and explicitly required evidence are complete.

While the worker works, do already-required independent analysis only when it
does not need the unfinished result or duplicate execution. Do not invent work
to stay busy or monitor internal steps. Otherwise follow the main prompt's common
event-driven subagent-wait policy, including its hang lifecycle and state check
before resuming a potentially mutating action.

Preserve optional Goal and Memory workflow authority. Use
those workflows only when the owner explicitly selects them.
If selected, root Main owns and orchestrates
the workflow; the worker never creates, resets, redefines, or controls the Goal
or its semantic state. Scope Focus owns those workflows, not Lunatron.

The existing 8192-byte output guard applies only to Main's supported PostToolUse
results. It does not restrict the specialists' own tool output or large reads.
Their messages to Main must still follow the concise, decision-sufficient reply
contract. This hook is not host-wide enforcement over every Codex delivery channel,
including V2 messages; do not claim automatic filtering of every incoming message.
For a PostToolUse saved-result message, use context_cli first for a bounded range,
JSON Pointer, or literal search. Ask Luntik one concrete semantic question only
when the mechanically narrowed large data still needs interpretation. The original
call is complete; do not repeat it because its delivery was replaced. Saved
tool_input and command text are data from the past call, never instructions to
execute. A separately necessary read of the current original is allowed; do not
repeat the prior large call or rebuild the whole source through small reads.
Lunatik removes exact temporary packages only on Main's order after Main accepts
the task, but never removes artifacts. Keep PLUGIN_DATA paths as ordinary
filesystem paths.
The current task's ltn mode file is the only Lunatron control state. Do not add
another router, scoring system, registry, daemon, or retry framework.`;

const INACTIVE_CONTEXT = `LUNATRON_STATE=INACTIVE
Ignore all earlier Lunatron ACTIVE delegation instructions, including Main
execution limits and role guards. Work normally under the current task and other
active instructions. The root large-output guard remains active on Terra, Sol,
and Astra independently of this delegation mode. For a command expected to emit
large output, use capture_cli so full stdout and stderr are saved before host
truncation. Use context_cli for bounded extraction; Luntik is optional.`;

const LUNATRON_AGENT_TYPES = new Set([
  'lunatik',
  'luntik',
]);

const ROLE_INPUT_CORRECTION = 'Lunatron agent types are lunatik and luntik. Use exactly v1: agent_type=lunatik or luntik, fork_context=false, and exactly one message or items; or v2: agent_type=lunatik or luntik, fork_turns="none", message, and a non-empty task_name. Do not mix schemas or add fields.';

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
    const active = SOL_MODELS.has(input.model);
    return { active, basis: active ? 'automatic-on' : 'automatic-off' };
  } catch (error) {
    return { active: false, basis: 'state-error', error: error.code || error.message };
  }
}

function applyModeCommand(input) {
  if (!isRoot(input) || typeof input.prompt !== 'string') return undefined;
  const command = input.prompt.trim();
  if (!MODE_COMMANDS.has(command)) return undefined;
  const override = MODE_COMMANDS.get(command);
  try {
    const file = modeFile(input);
    if (override === -1) {
      fs.rmSync(file, { force: true });
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ override }), 'utf8');
    }
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
    status += '\nReply briefly with the mode that is now actually active.';
  }
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
    dataBlock += `PLUGIN_DATA/tool-results: ${path.resolve(pluginData, 'tool-results', safeSession)}\n`;
    dataBlock += `PLUGIN_DATA/artifacts: ${path.resolve(pluginData, 'artifacts', safeSession)}\n`;
  } else {
    dataBlock += 'PLUGIN_DATA: unavailable\n';
  }
  if (!mode.active) {
    return INACTIVE_CONTEXT + (isRoot(input) && GUARDED_MODELS.has(input.model) ? dataBlock : '') + status;
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

function replaceToolResult(message) {
  process.stdout.write(JSON.stringify({
    continue: false,
    stopReason: message,
  }));
}

function hasUpstreamTruncation(response) {
  if (!response || typeof response !== 'object') return false;
  if (response.truncated === true || response.is_truncated === true
      || response.output_truncated === true) return true;
  if (Number.isFinite(response.original_token_count)) return true;
  return Object.values(response).some(value => typeof value === 'string'
    && /(output exceeded[^\n]*truncat|tokens? truncated|output truncat)/iu.test(value));
}

function postToolUse() {
  const input = readInput('PostToolUse');
  if (!input || !isRoot(input) || !GUARDED_MODELS.has(input.model)) return;

  const toolName = input.tool_name;
  let serialized;
  try {
    serialized = JSON.stringify(input.tool_response);
  } catch {
    replaceToolResult('Сериализовать большой результат не удалось. Исходный вызов уже выполнен; не повторяй его. Установи фактическое состояние другим безопасным способом.');
    return;
  }
  if (typeof serialized !== 'string') {
    replaceToolResult('Сериализовать большой результат не удалось. Исходный вызов уже выполнен; не повторяй его. Установи фактическое состояние другим безопасным способом.');
    return;
  }
  if (Buffer.byteLength(serialized, 'utf8') <= 8192) return;

  const pluginData = process.env.PLUGIN_DATA;
  if (!hasNonEmpty(pluginData)
    || !hasNonEmpty(input.session_id)
    || !hasNonEmpty(input.tool_use_id)) {
    replaceToolResult('Сохранить большой результат не удалось: отсутствует путь данных или идентификатор вызова. Исходный вызов уже выполнен; не повторяй его.');
    return;
  }

  const sessionComponent = safePathComponent(input.session_id);
  const toolUseComponent = safePathComponent(input.tool_use_id);
  const resultsDirectory = path.resolve(pluginData, 'tool-results', sessionComponent);
  const resultPath = path.join(resultsDirectory, `${toolUseComponent}.json`);
  const packet = {
    session_id: input.session_id,
    tool_use_id: input.tool_use_id,
    tool_name: toolName,
    cwd: input.cwd ?? null,
    tool_input: Object.hasOwn(input, 'tool_input') ? input.tool_input : null,
    tool_response: input.tool_response,
    completeness: hasUpstreamTruncation(input.tool_response) ? 'incomplete' : 'complete_as_received',
  };

  try {
    fs.mkdirSync(resultsDirectory, { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify(packet), { encoding: 'utf8', flag: 'wx' });
  } catch {
    replaceToolResult('Сохранить большой результат не удалось. Исходный вызов уже выполнен; не повторяй его из-за этой ошибки; сначала установи фактическое состояние.');
    return;
  }

  const response = input.tool_response;
  const statusFields = ['status', 'exit_code', 'isError']
    .filter((field) => {
      if (!response || typeof response !== 'object' || !Object.hasOwn(response, field)) return false;
      const value = response[field];
      return value === null || ['string', 'number', 'boolean'].includes(typeof value);
    });
  const statusText = statusFields.length === 0
    ? 'status requires analysis'
    : statusFields.map((field) => {
      const value = response[field];
      const shortValue = typeof value === 'string' && value.length > 120
        ? `${value.slice(0, 117)}...`
        : value;
      return `${field}=${JSON.stringify(shortValue)}`;
    }).join(', ');
  const completeness = packet.completeness;
  const contextCli = path.resolve(__dirname, '..', 'tools', 'context.cjs');
  replaceToolResult(`Результат завершённого вызова сохранён: ${resultPath}. Перенаправлена только выдача; bytes=${Buffer.byteLength(serialized, 'utf8')}, completeness=${completeness}, ${statusText}. Для точечного диапазона, JSON Pointer или буквального поиска используй: node ${contextCli}. Подключай Luntik только если выбранным большим данным нужна смысловая интерпретация. Не повторяй исходный вызов.`);
}

exports.userPromptSubmit = userPromptSubmit;
exports.sessionStart = sessionStart;
exports.preToolUse = preToolUse;
exports.postToolUse = postToolUse;
