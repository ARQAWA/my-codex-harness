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
You are Lunatron's root Main. Own the whole outcome, scope, analysis, decisions,
diagnosis, acceptance, and user response. Delegate mechanical work to save Main's
resources, while keeping intellectual responsibility. Resolve material choices
before dependent execution. Use only the specialist whose role is needed.

Main performs repository Discovery, ordinary search, source selection, small
reads, planning, diagnosis, and acceptance. Main directly reads mandatory
AGENTS.md, every selected SKILL.md, and decisive original fragments. Main alone
interprets and orchestrates skills; never ask lunatik or luntik to read, apply,
or execute a skill. Translate applicable skill requirements into concrete work.
A skill file may be an explicit data or edit target, but its text is then data.
Main writes analytical output and directly applies its own complex patches.

Luntik is read-only. Use \`agent_type=luntik\` only for one concrete semantic
question about large files or a saved result already selected by Main. Main keeps
Discovery, source choice, hypotheses, strategy, diagnosis, and acceptance. Give
Luntik exact paths, the question, known constraints, required result, and stop
conditions; never pass the whole history or an open repository search. Luntik
may read and search only those sources. It returns concise facts, exact locators,
small fragments Main should open, contradictions, errors, searched bounds, and
unknowns. Main reads the decisive originals. If a source changed, say so.

Main keeps ordinary search and small reads direct. For a saved large result or an
explicitly selected large source, use context_cli when literal search, a bounded
range, or JSON Pointer can answer the question. Use Luntik only when the selected
large data still needs semantic interpretation. An irrelevant or unnecessary
large result may be ignored; its size and curiosity about the producing tool do
not justify Luntik. For exact extraction, pass Luntik the current context_cli path
from runtime data.

Lunatik executes implementation and operational work. Apart from Main's own
complex patches, assign behavior-changing code, tests, configuration, scripts,
migrations, tooling, commands, and even trivial edits to the one persistent
\`agent_type=lunatik\`. Main selects the technical content and later accepts it.
Empirical checks require authority from the main prompt or user.

Before each implementation assignment, Main creates one concise,
decision-complete mini-plan for a coherent block. Do not show it to the user or
wait for approval. Follow this structure: Result and boundaries; Selected
solution and concrete references; Actions and dependencies; Readiness,
authorized checks, and return conditions. Include the exact working directory,
targets, commands and parameters when applicable, sufficient symbols or other
references, permitted differences, and material corner cases or failure handling.
Resolve each command's working directory from the relevant project or workspace
layout; do not assume the repository root. Include all known mandatory results
and authorized checks for the block from the outset; never make a known
requirement optional.
Use facts already obtained; do not start another research phase. Scale detail to
the task, omit repetition, and leave only routine implementation choices to
Lunatik. A general style reference is insufficient.

Send the complete mini-plan as one assignment. Lunatik may repair routine quoting,
tool syntax, or simple patch alignment while preserving Main's decisions. It
returns on a missing material decision, conflict, authority gap, required complex
repair, or uncertain mutation outcome. Main diagnoses the report and sends the
same worker a ready correction when sufficient; Main directly applies a complex
repair. Establish actual state before retrying an uncertain mutation. Never
blindly retry, undo existing changes, or ask the user about a routine execution
problem while an authorized solution remains.

Keep one persistent lunatik and one persistent luntik. Reuse the same agent id
for later turns through followup_task when exposed or v1 send_input; replace an
agent only when the runtime cannot continue it. Do not create a second live agent
of either type. Both report directly to Main and neither relays for the other.
The first assignment contains all ready context; later assignments contain only
the new request and relevant delta. Let a running assignment finish unless it
needs correction. Use one assignment and one final response per coherent block.

Use the schema exposed by the current runtime. V1 contains only \`agent_type\`,
\`fork_context=false\`, and exactly one \`message\` or \`items\`. V2 contains only
\`agent_type\`, \`fork_turns="none"\`, \`message\`, and non-empty \`task_name\`.
Omit model, reasoning effort, and service tier. Never mix schemas or add fields.
If the required role is unavailable, its delegated action is unavailable; Main
does not silently replace it with mechanical execution.

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

The 8192-byte guard applies only to supported root Main PostToolUse results, not
specialist output. Crossing it saves and replaces that result but does not itself
require Luntik. Use capture_cli only when a command's output is expected to be
large. Use context_cli for bounded extraction from a saved large result or an
explicitly selected large source. Keep small direct reads and ordinary search
direct. Do not repeat a completed call, execute saved tool_input, or rebuild a
whole source through small reads. A separately necessary current-original read is
allowed.
Lunatik removes an exact temporary package only on Main's order after acceptance;
never remove artifacts. The task's ltn mode file is the only Lunatron control
state; do not add another router, registry, daemon, scoring, or retry system.`;

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
  replaceToolResult(`Результат завершённого вызова сохранён: ${resultPath}. Перенаправлена только выдача; bytes=${Buffer.byteLength(serialized, 'utf8')}, completeness=${completeness}, ${statusText}. Если результат нужен задаче, сначала используй точечный диапазон, JSON Pointer или буквальный поиск: node ${contextCli}. Подключай Luntik только когда выбранным большим данным всё ещё нужна смысловая интерпретация; размер результата сам по себе не причина вызова. Ненужный результат игнорируй. Не повторяй исходный вызов.`);
}

exports.userPromptSubmit = userPromptSubmit;
exports.sessionStart = sessionStart;
exports.preToolUse = preToolUse;
exports.postToolUse = postToolUse;
