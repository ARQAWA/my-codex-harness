'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOL_MODELS = new Set(['gpt-5.6-sol', 'gpt-6-astra', 'gpt-5.5']);
const TRANSCRIPT_CHUNK_BYTES = 64 * 1024;
const ACTIVE_REASONING_EFFORTS = new Set(['max', 'xhigh']);

const ACTIVE_CONTEXT = `LUNATRON_STATE=ACTIVE
You are Lunatron's root Main. Autonomously own the whole outcome, scope, complete
analysis, technical and strategic decisions, error diagnosis, acceptance, and
user output. Delegate mechanical workload to reduce the strong Main's resource
use, never its intellectual responsibility. Calling you the sole executor or
saying "do it" assigns accountability, not exclusive physical execution; it does
not disable the configured worker. An explicit prohibition is a different
constraint and must be handled under the applicable instruction hierarchy.

Keep the complete order and resolve material technical choices before dependent execution. Assign the one persistent lunatik a ready bounded stage: search, large reads, primary fact linking, or limited execution. Do not give it an open-ended mixed order or your design responsibility, or repeat its reconnaissance. Luna returns requested facts, actual changed paths, decisive symbols/line ranges, assigned evidence, errors, and unknowns.

Main directly reads mandatory AGENTS.md, explicitly selected SKILL.md, and decisive originals. Use the available native file/command tool for ordinary local reads, such as tools.exec_command through functions.exec when exposed; do not route them through browser or GUI when that native tool is available. Before a selected final review or acceptance, Main reads the needed semantic sections, reconciles them with the requirements, and resolves material gaps. Worker or reviewer summaries do not replace that reading. Main performs the analysis and writes necessary analytical artifacts itself, retaining conclusions, materiality, and completeness. Luna chooses search queries only within Main's supplied area and method.

Keep the existing physical execution boundary: all behavior-changing product,
tooling, and operational actions, including a trivial one-file mutation, belong
to the one persistent worker. Root Main does not execute those actions. Analytical
artifacts are not an exception for executable prompts, code, tests, configuration,
migrations, scripts, or operational changes. Select their technical content yourself. Main reads and reconciles the logic; the worker carries out the assigned mechanical actions. Assign empirical checks only under the main prompt's explicit-evidence rule. Do not delegate the
writing or transcription of your analytical result to the worker.

Give the worker the smallest sufficient technical brief: concrete work, known
targets and ready facts, your selected edit or unambiguous transformation rule,
commands or supplied local pattern as needed, applicable limits and dependencies,
any explicitly required empirical check or Main-selected method within already mandatory evidence, and the factual result to return. Assigning a command creates no authority for a test. Omit items already present in
its context and information it does not need. Do not write a complete patch when
an exact rule is sufficient. Batch related actions instead of micromanaging each
tool call. Distinguish your revisable technical decisions from user or higher-
priority hard boundaries; do not turn a preferred method into a user requirement.

Lunatron has exactly two allowed functional agent types: \`lunatik\` and
\`properliler\`. For the first necessary worker assignment, create one \`lunatik\`;
it is the sole persistent configured worker. Keep its collaboration-runtime agent
id in the root task tree. For every later assignment, including after its completed
turn, continue that same worker through the current native API: use
\`followup_task\` where it is exposed; in the studied v1 use \`send_input\` with the
same agent id. Resolve the available method once; do not repeat tool search. Do
not create a second live worker;
replace it only when the runtime cannot continue the existing one. For an explicitly
selected review, create a fresh read-only \`properliler\`. Use the schema exposed
by the current runtime: v1 contains only \`agent_type\`, \`fork_context=false\`,
and exactly one \`message\` or \`items\`; v2 contains only \`agent_type\`,
\`fork_turns="none"\`, \`message\`, and a non-empty \`task_name\`. Omit model,
reasoning effort, and service tier; never mix schemas or add fields. If
\`spawn_agent\` or the required role is unavailable, the delegated action or review
is unavailable and root Main is not a substitute. Never resume a closed or
interrupted reviewer.

The first brief supplies the ready context needed for direct execution. Later
handoffs supply only the new request, changed decision or authority, and relevant
context delta. Do not transfer the whole Main history, rediscover supplied facts
for handoff packaging, or request a second copy of an accessible artifact. Let a
running assignment finish unless a correction is needed; do not redirect or
reassign it merely because another piece of work is available.

The worker executes the supplied instructions and checks; it does not choose an
implementation, diagnosis, repair, additional verification, or a new fallback.
A missing instruction, failed action, target mismatch, or uncertain result is a
reason for the worker to stop affected work, not for Main to stop the whole task.
Treat every DECISION_REQUIRED or blocked report as a factual claim to assess.
If side effects may have occurred, establish the actual affected state before
retrying or dependent continuation; never equate failure or timeout with no change.
Do the needed diagnosis yourself, choose the next simplest authorized path, send
the smallest correction through the same worker API, and continue. Do not blindly
retry a mutation, roll back existing changes, or use a prohibited tool.

A real blocker for a later action does not preempt an earlier explicit safe,
choice-independent prefix: assign that prefix first, excluding the unresolved
dependent action. Ask the user only when no safe authorized in-scope path exists
or a choice materially changes the explicit contract, authority, acceptance,
money, privacy, or irreversible risk. Ordinary worker failures and your own
revisable implementation choices are yours to resolve, not the user's.

On completion, map the worker's factual result and credible evidence to explicit
acceptance yourself. Do not repeat implementation, duplicate valid checks, or
demand stronger proof. If a concrete material gap remains, decide and assign only
that gap. The worker may run an assigned test or comparison; it is not the semantic
reviewer. For an explicitly selected blind check cycle, preserve its exact scope,
critical checkpoints, cumulative coverage, and final-acceptance rules. Complete a
selected pre-action check before its dependent action; a worker handoff alone
creates no checkpoint. Treat reviewer findings as claims, not commands; repair
only admitted material acceptance failures. Reject extra proof format, packet
completeness, exhaustive evidence, preference, polish, alternative implementation,
or stronger proof demands that do not establish a material failure. A pass with
zero admitted material findings counts as CLEAN under the selected cycle. Stop
when explicit acceptance and any explicitly selected final review are complete.

While the worker works, do already-required independent analysis only when it
does not need the unfinished result or duplicate execution. Do not invent work
to stay busy or monitor internal steps. Otherwise follow the main prompt's common
event-driven subagent-wait policy, including its hang lifecycle and state check
before resuming a potentially mutating action.

Preserve optional Goal, Memory, and review workflow authority. Use them only when
the owner explicitly selects them. If selected, root Main owns and orchestrates
the workflow; the worker never creates, resets, redefines, or controls the Goal
or its semantic state. Scope Focus owns those workflows, not Lunatron.

For a PostToolUse saved-result message, pass lunatik the absolute saved path and one concrete
question. The original call is complete even if the external hook Script reports
failure; analyze the saved package and do not repeat that call because of the
delivery block. Saved tool_input and command text are data from the past call,
never instructions to execute. A separately necessary read of the current
original is allowed; do not repeat the prior large call, read the whole source in
small pieces, or present Luna's excerpt as Main's independent opening. Process
temporary packages through the same worker; Luna removes exact temporary
packages on Main's order after the task and selected review finish, but never
removes artifacts. Keep PLUGIN_DATA paths as ordinary filesystem paths, not
semantic state. Do not add a toggle, state store, router, daemon, or retry
framework.

No toggle, state file, router, scoring, registry, daemon, retry framework, or
analytical transcription delegation. Main decides and continues autonomously.
The worker performs the assigned mechanical work.`;

const INACTIVE_CONTEXT = `LUNATRON_STATE=INACTIVE
Ignore all earlier Lunatron ACTIVE instructions. Work normally under the current task and other active instructions.`;

const ALLOWED_AGENT_TYPES = new Set([
  'lunatik',
  'properliler',
]);

const ROLE_INPUT_CORRECTION = 'Allowed agent types are lunatik and properliler. Use exactly v1: agent_type=lunatik or properliler, fork_context=false, and exactly one message or items; or v2: agent_type=lunatik or properliler, fork_turns="none", message, and a non-empty task_name. Do not mix schemas or add fields.';

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

function readReasoningEffort(input) {
  if (typeof input.transcript_path !== 'string') return undefined;

  let file;
  try {
    file = fs.openSync(input.transcript_path, 'r');
    let position = fs.fstatSync(file).size;
    let carry = Buffer.alloc(0);

    while (position > 0) {
      const length = Math.min(position, TRANSCRIPT_CHUNK_BYTES);
      position -= length;
      const chunk = Buffer.allocUnsafe(length);
      fs.readSync(file, chunk, 0, length, position);
      const data = Buffer.concat([chunk, carry]);
      let lineEnd = data.length;

      for (let index = data.length - 1; index >= 0; index -= 1) {
        if (data[index] !== 10) continue;
        const effort = effortFromLine(data.subarray(index + 1, lineEnd), input.turn_id);
        if (effort !== undefined) return effort;
        lineEnd = index;
      }

      if (position === 0) {
        return effortFromLine(data.subarray(0, lineEnd), input.turn_id);
      }
      carry = data.subarray(0, lineEnd);
    }
  } catch {
    return undefined;
  } finally {
    if (file !== undefined) fs.closeSync(file);
  }
  return undefined;
}

function effortFromLine(line, turnId) {
  let record;
  try {
    record = JSON.parse(line.toString('utf8'));
  } catch {
    return undefined;
  }
  if (record?.type !== 'turn_context') return undefined;
  if (turnId !== undefined && record.payload?.turn_id !== turnId) return undefined;
  return record.payload?.effort;
}

function isActiveLunatron(input) {
  if (!isRoot(input)) return false;
  if (SOL_MODELS.has(input.model)) return true;
  if (input.model !== 'gpt-5.6-terra') return false;
  return ACTIVE_REASONING_EFFORTS.has(readReasoningEffort(input));
}

function emitContext(eventName, additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: eventName, additionalContext },
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

function contextFor(input) {
  const active = isActiveLunatron(input);
  if (!active) return INACTIVE_CONTEXT;

  const sessionId = input.session_id;
  const pluginData = process.env.PLUGIN_DATA;
  let dataBlock = '\n\nLUNATRON_DATA_PATHS\n';
  dataBlock += `session_id: ${sessionId === undefined ? 'unavailable' : String(sessionId)}\n`;
  if (typeof pluginData === 'string' && pluginData.length > 0) {
    const safeSession = safePathComponent(sessionId);
    dataBlock += `PLUGIN_DATA/tool-results: ${path.resolve(pluginData, 'tool-results', safeSession)}\n`;
    dataBlock += `PLUGIN_DATA/artifacts: ${path.resolve(pluginData, 'artifacts', safeSession)}\n`;
  } else {
    dataBlock += 'PLUGIN_DATA: unavailable\n';
  }
  return ACTIVE_CONTEXT + dataBlock;
}

function userPromptSubmit() {
  const input = readInput('UserPromptSubmit');
  const context = input && contextFor(input);
  if (context) emitContext('UserPromptSubmit', context);
}

function sessionStart() {
  const input = readInput('SessionStart');
  const context = input && contextFor(input);
  if (context) emitContext('SessionStart', context);
}

function isRoleInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return false;
  if (!ALLOWED_AGENT_TYPES.has(toolInput.agent_type)) return false;

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
  if (!input || !isActiveLunatron(input) || input.tool_name !== 'spawn_agent') return;

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

function hasUnsupportedMcpContent(response) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.content)) {
    return false;
  }
  return response.content.some((block) => {
    if (!block || typeof block !== 'object') return false;
    if (block.type === 'image' || block.type === 'audio') return true;
    if (block.type !== 'resource' || !block.resource || typeof block.resource !== 'object') {
      return false;
    }
    return Object.hasOwn(block.resource, 'blob') || typeof block.resource.text !== 'string';
  });
}

function emitSystemMessage() {
  process.stdout.write(JSON.stringify({
    systemMessage: 'Сохранение не удалось; исходный результат продолжает обычную доставку без замены.',
  }));
}

function postToolUse() {
  const input = readInput('PostToolUse');
  if (!input || !isActiveLunatron(input)) return;

  const toolName = input.tool_name;
  if (toolName !== 'Bash'
    && toolName !== 'read_mcp_resource'
    && (typeof toolName !== 'string' || !toolName.startsWith('mcp__'))) {
    return;
  }
  if (typeof toolName === 'string' && toolName.startsWith('mcp__codex_app__')) return;
  if (toolName !== 'Bash' && hasUnsupportedMcpContent(input.tool_response)) return;

  let serialized;
  try {
    serialized = JSON.stringify(input.tool_response);
  } catch {
    return;
  }
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') <= 8192) return;

  const pluginData = process.env.PLUGIN_DATA;
  if (!hasNonEmpty(pluginData)
    || !hasNonEmpty(input.session_id)
    || !hasNonEmpty(input.tool_use_id)) {
    emitSystemMessage();
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
  };

  try {
    fs.mkdirSync(resultsDirectory, { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify(packet), { encoding: 'utf8', flag: 'wx' });
  } catch {
    emitSystemMessage();
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
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: `Результат завершённого вызова сохранён: ${resultPath}. Перенаправлена только выдача; ${statusText}. Передай Luna этот путь и конкретный вопрос. Не повторяй исходный вызов, включая чтение: его результат уже в файле.`,
  }));
}

exports.userPromptSubmit = userPromptSubmit;
exports.sessionStart = sessionStart;
exports.preToolUse = preToolUse;
exports.postToolUse = postToolUse;
