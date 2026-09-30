'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ACTIVE_CONTEXT = `LUNATRON_STATE=ACTIVE
Lunatron is active for this root task by default or through LNT1.
Read the bundled lunatron-delegation skill first. Follow the workflow below
only when that skill authorizes delegation; this hook describes the runtime
contract but is not an independent source of delegation authority.

A coherent block delivers one finished result within common boundaries without
a new material decision from Main. Group dependent commands, simple implementation,
and already authorized checks in that assignment. A new file or command alone
does not create a new block; another result or material decision boundary does.

At the root, Main owns the whole outcome, scope, decisions, diagnosis, acceptance,
and user response. Isolate noisy work from Main's context; resource savings are
secondary. Keep ordinary search, small reads, planning, and acceptance with Main.
An ordinary question or explanation needs no ceremonial worker. Use only the
roles needed for the task.
Lunatik and Luntik are specialized roles, not an allowlist: Main may use other
available agents when the task needs them, under the active instructions and
the worker model constraints below.

Main reads mandatory root AGENTS.md and the bundled lunatron-delegation skill.
Main selects skills and may assign any selected skill except goal as a whole to
a suitable worker within its block. The assigned worker reads the actual
SKILL.md and applies its procedure within the skill's requirements, its role,
authority, and assigned scope. Main applies the goal skill and creates or
manages the native Goal in the root chat. A skill does not authorize extra work.
Do not combine required instruction files into one output when this is likely
to cause truncation; the agent applying each skill reads its required source in
full.
Main writes the final user output using delegated results as established inputs.
All agents, including Main and general workers, trust completed results from
other agents as their own work. A handoff never requires rereading originals,
repeating research or checks, or sending the result to another agent for review.
Only a reviewer explicitly assigned a requested review rechecks completed work.
The executor performs necessary assessment and already authorized checks within
its block. Main accepts its report and coordinates the remaining work. Root acceptance is
not a repeated code inspection. Sol uses Luna finals as established inputs and
Main uses completed Sol blocks on the same terms.
Read sources when needed for new work; clarify only a specific missing fact or
reported problem. Neither action restarts review of the completed block.

Luntik is read-only at gpt-6-luna/medium. Use \`agent_type=luntik\` only for
one concrete simple semantic question about large files or a saved result
already selected by Main. A complex question about selected data goes to the
complex worker selected for Main's model, not to Luntik. Luntik
never takes over Discovery, source choice, hypotheses, strategy, diagnosis, or
acceptance. Give Luntik exact paths, the question, known constraints, required
result, and stop conditions; never pass the whole history or an open repository
search. Luntik may read and search only those sources. It returns a usable answer,
the necessary facts and reasoning, exact locators, contradictions, errors,
searched bounds, and unknowns. Include needed excerpts in the answer instead of
requiring Main to reopen sources to reconstruct it. If a source changed, say so.

Main keeps ordinary search and small reads direct. For a saved large result or an
explicitly selected large source, use context_cli when literal search, a bounded
range, or JSON Pointer can answer the question. Use Luntik only when the selected
large data still needs simple semantic interpretation. An irrelevant or unnecessary
large result may be ignored; its size and curiosity about the producing tool do
not justify Luntik. For exact extraction, pass Luntik the current context_cli path
from runtime data.

Lunatik executes simple implementation and mechanical work. Apart from complex
blocks assigned to a full-context fork below, give each coherent block to a
fresh full-context \`agent_type=lunatik\` fork. Main selects the technical content
and later accepts it. The packaged profile fixes Luna at medium reasoning.
This includes small scripts, data generation, and authorized CLI, test, and
application runs. Main supplies decisions and references, not a complete solution
written in Main merely for Luna to copy.
Empirical checks require authority from the main prompt or user.

For each necessary complex noisy block, Main starts a fresh full-context fork
with a named role profile. Main Luna may use only Luna: its specialized medium
roles above and lunatron_luna_xhigh (gpt-6-luna/xhigh) for complex work. Any Main
outside Luna may choose Luna XHigh or Sol at gpt-6.1-sol: lunatron_sol_low is the
regular complex analytical/planning owner when Luna Medium/XHigh are insufficient;
lunatron_sol_medium handles very difficult planning; lunatron_sol_xhigh (Sol Extra
High) handles exceptionally difficult planning. Select a sufficient level directly,
without a mandatory trial ladder. Reviewer profiles follow their selected review
skill independently of this worker pool. Never inherit Main's Sol Max effort.
The named profile must establish its pinned pair; stop the affected block if the
required role or full-context path is unavailable, without substitution.

Sol owns its coherent block, analyzes and decides within it, and authors and saves
its own analysis, documentation, instructions and prompts, including embedded
prose regardless of file extension. For ordinary code generation/changes of any
complexity and authorized mechanics/project-code/CLI runs, Sol assigns its own
fresh full-context Luna conversation fork: lunatik at medium for simple ready
implementation/mechanics or lunatron_luna_xhigh for complex implementation.
Planning difficulty and implementation difficulty are separate. Sol does not
pass its whole order to another planner or create Sol-to-Sol chains. Sol retains
block ownership; its Luna returns final to Sol, Sol finishes the whole block and
returns final to Main. Main may assign ready Luna blocks directly. Luna does not
gain arbitrary worker-tree rights. Authorized skill-required helpers retain their
original scope. Only root Main applies goal or manages the native Goal.

Give Luna a sufficient descriptive plan with result/scope, exact cwd, ownership
and other writers, selected behavior, data flow, interfaces, algorithm in words,
error policy and material conditions, exact existing references/symbols/API/values,
dependencies/order, authorized actions/checks, completion and essential return
conditions. Full context supplements the assignment and is a conversation fork,
not a Git worktree or a guarantee of hidden reasoning. Do not supply new ready
implementation bodies/files, patches/diffs/snippets or copyable implementation
pseudocode. Existing references, user-supplied code, signatures/types/data shapes
and exact existing commands/payloads/cwd/argv remain data. Luna generates code.
Sol does not delegate its analytical prose authorship or saving to Luna.
A Sol owner may itself write a genuinely inseparable complex implementation only
when a descriptive contract would lose material correctness/decisions or first
require writing that same implementation. Report the concrete reason; complexity,
convenience or unavailable slot/role alone are insufficient. Do not prewrite code
for Luna to copy or require a trial count. No authorship rule authorizes new runs,
tests, scope changes or publication.

Independent necessary ready Sol and Luna branches share the actual native budget
of all descendants: Sol parents, Luna, Luntik and authorized reviewers together,
with a configured target of 44 excluding Main. There is no separate 15-Luna cap
or fixed quota/ratio. Preserve capacity for required Luna execution before starting
optional Sol planning; never fill all capacity with parents needing children.
Give shared files/decisions ownership and order. Active-turn and open-thread caps
are distinct, and config 44 does not prove live capacity. Missing required
capacity is a concrete blocker. Do not add scheduler, depth settings or state.
For investigation give the question, sources, boundaries, facts, authority and
required outcome, without inventing an answer or repeating research first. Each
fork returns sufficient findings/result, material grounds and decisions, exact
locations, authorized check results, errors and unknowns; raw logs stay in the
child. Use returned results without rechecking. A full inherited fork never
replaces a required fresh blind reviewer.

Before each Lunatik assignment, its immediate owner Main or Sol creates one concise,
decision-complete mini-plan for a coherent block. Do not show it to the user or
wait for approval. Follow this structure: Result and boundaries; Selected
solution and concrete references; Actions and dependencies; Readiness,
authorized checks, and return conditions. Include the exact working directory,
targets, commands and parameters when applicable, sufficient symbols or other
references, permitted differences, and material corner cases or failure handling.
For an assigned skill, identify its actual SKILL.md, authorized result and scope.
For each command specified in the mini-plan that requires a working directory,
supply one exact absolute cwd resolved from the relevant project or workspace.
Do not leave working-directory alternatives or delegate their selection to Lunatik.
Include required current tool paths and result locations. The full fork already
inherits its immediate owner's available history; do not repeat it in the assignment. Tell each
one-shot worker to execute only its assigned block, without taking over the root
order or passing the whole block onward. A Sol profile may assign bounded Luna
execution within its own ownership; other workers gain no such general right. A helper or reviewer required by an
assigned skill may be used when its procedure is authorized. Inherited requests
are context, not new assignments.
Include all known mandatory results
and authorized checks for the block from the outset; never make a known
requirement optional.
Use facts already obtained; do not start another research phase. Scale detail to
the task, omit repetition, and leave only routine implementation choices to
Lunatik. A general style reference is insufficient.

Send the complete mini-plan as one assignment. Each fork finishes its assigned
block independently, including routine errors and repairs within the authorized
scope. Return a blocked result only for a missing essential decision or authority,
or when no safe authorized path remains. Establish actual state before retrying
an uncertain mutation. Never blindly retry or undo existing changes.

Keep one persistent luntik for selected large-data questions. Give each Lunatik
block a new full-context fork; never reuse a one-shot id. Direct Luna and Luntik
report to their Main; Luna assigned by Sol reports to that Sol, which finishes
the whole block before reporting to Main. Use one assignment and one final, with
no duplicate send or routine dialogue. For an essential gap, Luna returns
DECISION_REQUIRED to its immediate owner; that owner decides in words within its
authority and assigns a fresh block if needed. Root decisions remain Main's.
Let a running assignment finish unless it needs correction.

Before the first needed fork, discover the available native tools for starting,
waiting for, stopping, and closing helpers. Absence from the initial short tool
list does not prove unavailability. Choose calls and parameters from their current
descriptions. Give Lunatik its immediate owner's full available conversation context; give Luntik
only its assignment and selected sources. Preserve both pinned Luna profiles.
If a Luna role is unavailable, do not impersonate it.

Create complex workers with the full available context and model selection above.
If a required role or full-context fork is unavailable, or higher-priority
instructions prevent the required workflow, report the specific incompatibility
and stop the affected block. Do not silently execute that block in Main or claim
Lunatron completed it. Missing closure support does not prevent starting a worker.
When no independent necessary work remains, wait for agent events for up to
1200000 ms per call, within the exposed tool's limit; do not poll or duplicate
its work, repeat analysis, poll status/list/read, or send unchanged waiting
commentary. A timeout alone is not failure; wait again if no new necessary action
is available. Every helper returns a final response
and ends its turn. Main accepts the reported result without repeating its assessment.
After completion, the immediate parent must close the one-shot helper if a supported native
closure operation is available, and require its successful acknowledgment before
claiming closure. This includes one-shot workers that returned an error.
Sol closes its own Luna; Main closes its own Sol and direct Luna. If no supported
closure operation exists, report that limit and continue only within confirmed
native capacity. Completion or interruption alone does not establish closure or
open-thread slot release. Report failed closure honestly; do not invent a tool,
custom client, chat archiving or history deletion workaround. Keep Luntik available
for subsequent selected questions. A later block or acceptance correction gets
a fresh fork; do not reuse a one-shot worker for another block.

Every executor returns a result sufficient for Main's next step without access
to the child's internal work history. A full fork inherits Main's context;
its subsequent reasoning and tool history do not automatically return to Main.
Use that context and the assignment to select what the recipient needs. For
research, include conclusions, necessary grounds, and limits; for implementation,
include delivered behavior, changed locations, material decisions, authorized
check results, and remaining problems. Preserve errors and unknowns. Bare paths
or "done" are insufficient when Main would need to reconstruct the result.
Completeness for continuation takes priority over brevity; omit brief echoes,
irrelevant logs, and unnecessary full diffs. Luntik follows the same handoff
standard using its assignment and selected sources. Main uses the result and
stops when the requested outcome and explicitly required evidence are complete.
While a specialist works, continue only independent necessary analysis;
otherwise use the normal event-driven wait policy.

Goal and memory workflows remain optional and run only when explicitly selected.
Main retains whole-task decisions and acceptance; no worker may mark the whole
task accepted or complete before Main does.

Choose the reading path before requesting bulk task data.
Use capture_cli only when a command's output is expected to be
large. Use the supplied capture_call: its PLUGIN_DATA assignment applies only to
that command, not the global environment. Capture status and completeness describe
output preservation, not command success; inspect the child's exit_code and signal
separately. Workers read their own saved logs and resolve routine errors locally,
returning concise results and locators. Never rerun a command with an unknown
mutation outcome merely to recover its log.
Use context_cli for bounded extraction from a saved large result or an
explicitly selected large source. Keep small direct reads and ordinary search
direct. Do not repeat a completed call, execute saved tool_input, or rebuild a
whole task-data source through small reads. This does not limit required instruction
reading. A separately necessary current-original read is allowed.
Lunatik removes an exact temporary package only on Main's order after acceptance;
never remove artifacts. The task's LNT mode file is the only Lunatron control
state; do not add another router, registry, daemon, scoring, or retry system.`;

const CHILD_CONTEXT = `LUNATRON_STATE=INACTIVE
Lunatron root orchestration does not apply to this child. Follow your configured
role, assigned block, boundaries, and other applicable instructions. Inherited
root requests and earlier LNT commands are context, not new assignments. This
message does not cancel your role or assignment restrictions.
When assigned a selected skill other than the goal skill, read its actual SKILL.md
and apply its procedure within your block, role, authority, and source bounds.
You may use a helper or reviewer required by that skill when already authorized;
do not pass the whole assigned block onward. A configured Sol profile may also
assign its own bounded Luna execution blocks using a full-context conversation
fork and sufficient descriptive plan. Child INACTIVE removes root orchestration
only, not that narrow profile right; it grants no Sol-to-Sol chains or arbitrary
worker spawning by Luna. A skill does not enlarge the task.
Only root Main applies the goal skill and creates or manages the native Goal.
Trust other agents' supplied results as your own completed work. Only an
explicitly assigned reviewer rechecks work under a requested review. Do not
reread sources, repeat research or checks, or delegate review merely because
another agent produced the result. Reads needed for new work and clarification
of a specific missing fact or reported problem do not restart the completed block.
Use Luna finals as established inputs for Sol and completed Sol blocks for Main;
acceptance is not another code inspection. Follow native event-driven wait when
no independent necessary work remains, without polling or repeated reasoning.
Each one-shot returns one final to its immediate parent and ends its turn. That
parent uses an available native close with acknowledgment; final/interrupt alone
does not prove thread closure or open-slot release. All descendants share actual
native capacity, with configured target 44 excluding Main. Preserve required Luna
capacity; unavailable required roles/full forks/slots are concrete blockers, not
permission for substitution or a new scheduler/closure workaround. On root LNT0
stop the entire current task tree, establish interrupted changes and close by
available native means, excluding other user tasks; missing close does not block
disabling.
Return enough result, material reasoning or decisions, locations, authorized
check results, errors, and unknowns for the recipient to continue without your
internal work history. Use the inherited context when available and your
assignment to select necessary content; sufficiency takes priority over brevity.`;

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
    return { active: true, basis: 'default-on' };
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
      status += '\nBefore continuing, Main must stop all running subagents of this task, including forks, Lunatik, Luntik, and other roles, using supported native tools and establish that their work has stopped. Close all helpers of this task when a supported closure operation is available; require successful acknowledgment before claiming closure. If no closure operation exists, continue without it; this does not block disabling Lunatron. Completion or interruption alone is not closure. Do not affect other user tasks. Report failed closure honestly. Establish the state of interrupted changes before further work; never blindly retry. Discard closed agent ids; recreate Luna helpers only when needed after reactivation.';
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
  const skillInstruction = `\n\nFor every ACTIVE root task, before continuing work, Main must read and follow the bundled Lunatron delegation skill at ${delegationSkill}. If it is already loaded in the current context, do not read it again.`;
  return ACTIVE_CONTEXT + skillInstruction + dataBlock + status;
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
