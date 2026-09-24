---
name: task-notebook
description: Explicitly manage medium or long complex tasks with an adaptive plan, user amendments, evidence, and durable progress across context changes. Use only when the user selects Task Notebook for the task.
---

# Task Notebook

Use after the user's explicit selection for this task, including its continuations,
until completion or cancellation. A new independent order needs a new selection.
A retained notebook or a lookup of its header does not activate this skill.

Keep a small current view from which the agent can establish the effective order,
completed work and its grounds, what changed, and the next concrete action. Use
detail on demand. The notebook supports the task; it grants no authority.

## Start and ownership

- use the Task Notebook session_id and Task Notebook plan locator supplied by the `scope-focus-bootstrap` skill. Store the notebook only in the operating system's temporary directory: `os.tmpdir()/scope-focus/task-notebook/<session-key>/plan.md`, where session-key is the UTF-8 bytes of session_id encoded as hex. Keep its notes, work records, reports, and needed evidence in that temporary notebook directory. Do not use the repository, a plugin cache, or a persistent external artifacts directory. OS cleanup may remove these files; do not create a hidden permanent copy. If a recorded old locator differs, use the current SessionStart locator. If the file is missing, continue only from available task sources and do not invent recovered state.
- Read an existing header before writing. For the same continuing task, retain
  its task key and records. For a new explicitly selected order, choose one unused
  filesystem-safe task key. Never overwrite a different task's active notebook.
  If its relationship to the new request is unclear, resolve that material choice.
- Main owns the order, planning, decisions, and current state. Use the environment's
  configured executor for writes where required. Other agents return results to
  Main instead of independently editing the shared plan.
- Kimi Code has no durable goal tool: there is no native Goal object to associate.
  Newer user instructions govern the effective order. The `goal` skill states goal
  text only and creates no durable record.
- If the session ID, temporary notebook locator, or restore event is unavailable,
  report the actual limitation when needed. Use an explicitly supplied notebook
  path inside the operating system's temporary directory for manual continuation
  when available; do not promise automatic restore or mix in another session's
  records. Continue compatible work with available context.

## Notebook layout

Create only `plan.md` initially. Add other records when their content is needed:

| Path, relative to the session notebook directory | Purpose |
| --- | --- |
| `plan.md` | Header, effective order, user amendments, current step, plan, and links. |
| `<task-key>/notes.md` | Shared tools, access context, rules, sources, reusable findings. |
| `<task-key>/work/<part-id>.md` | A part's working detail, meaningful chronology, actions, problems, evidence, and eventual report. |
| `<task-key>/evidence/…` | Required originals that do not already have a suitable durable location. |
| `<task-key>/report.md` | Final notebook outcome and links, unless a suitable report already exists at the required destination. |

The header names the exact session, task key, explicit selection source, and status:
`working`, `waiting`, `blocked`, `complete`, or `cancelled`. Follow it with the
effective order, current amendments, current step, TODO plan, and record links.
Keep stable part IDs when reordering; use source case IDs when present.

This abbreviated example shows the shape; keep the full required list in real work:

```text
Session: actual session_id
Task: selected task-key and short task identity
Selected by: user message locator or necessary exact excerpt
Status: working

Current order: required result, conditions, exact constraints, source references.
User amendments: source, what changed, which former conditions no longer apply.
Current step: TC02; waiting for the recorded ingest operation; resume condition.
Plan:
  [x] TC01 — executed; PASS → <task-key>/work/TC01.md
  [ ] TC02 — waiting
      [x] Prepare and submit data → saved operation record
      [ ] Compare the processed result
  [ ] Remaining required cases, each retained with its own status
Records: shared notes, work records, required originals.
```

## Work cycle

1. Capture the result, every known requirement, source, and completion condition.
   Sketch the overall plan using current understanding. Keep all known mandatory
   work visible, without pretending to know every future implementation detail.
2. Before the next action, research and design the work sufficiently to perform it
   correctly. Establish the relevant tools, access, data preparation, rules, and
   expected outcome. Follow documentation links as deeply as this decision needs.
   Save shared findings once and reuse them while applicable.
3. Revise any affected plan level from those facts, then execute the next sufficiently
   understood step. Future details may remain unknown; concrete actions must be
   understood before execution.
4. Record meaningful results, necessary evidence, and the next action or wait
   condition. Continue the cycle with the next required work.
5. Complete a substantive part's work record before collapsing its plan branch to
   a short status, result, and link. The same work file becomes its report.

Usually expand the nearest branch. Retain multiple active branches only when the
task requires them, such as useful independent work during a wait. Do not impose
serial execution, parallelism, a fixed TODO depth, or whole-product research.

## User amendments

- Keep an integrated **Current order** at the top of `plan.md`: current objective,
  result, scope, constraints, exact values, mandatory procedure, and completion
  conditions. New user corrections belong here before dependent work continues.
- Later instructions replace only conflicting earlier conditions. Preserve every
  unaffected requirement. Retain exact paths, commands, values, prohibitions, and
  materially required wording; do not weaken them through summarization.
- In **User amendments**, record the source and what was added, replaced, or
  cancelled. Avoid copying the whole current order again. If the source will not
  remain accessible after compaction, retain the necessary original excerpt here.
  Clearly mark superseded conditions as inactive.
- Keep active requirements and amendments relevant to continuation in the plan.
  A lengthy history of superseded amendments may move into linked notes. Never
  remove a current condition for brevity. Status questions and acknowledgements
  need no amendment entry unless they change the order.
- Update affected plan branches and flag completed results whose grounds changed.
  Preserve unaffected results. Resolve material ambiguity before dependent action;
  continue compatible work while awaiting necessary clarification.
- A previously stated goal text does not override newer user instructions.

## Replanning

The working plan may be replaced at any level, including the whole plan. Use new
facts, design conclusions, dependencies, or user instructions as grounds. Preserve
the effective order and required outcomes, plus the history of actions and evidence.
An explicitly required method or sequence remains binding until the user changes it.

Identify affected conclusions and branches, revise the necessary part or the whole
plan, and briefly record why with a source locator. Do not save every plan revision.
Keep significant abandoned attempts and their reasons in the relevant work record
so the agent does not rediscover the same failure.

Reuse results that remain applicable. Mark changed applicability explicitly: an
executed action stays a historical fact even if its result no longer meets the
revised order. Never drop required coverage while reorganizing. For example,
grouping 50 cases around shared preparation still retains all required cases and
their statuses in the plan or its immediately linked list.

## Save and read economically

Update only affected content after an amendment, meaningful result, plan change,
valuable finding, important operation, or a changed continuation condition. Group
minor actions into the nearest substantive update. Plan update frequency and
evidence capture frequency are different: save necessary perishable evidence when
obtained, without rewriting the plan after every tool call.

Before an operation whose repetition has material consequences, record its intent
and exact target. Afterwards retain the result or operation ID. If the outcome is
unknown, leave it explicitly uncertain and establish the actual state before retrying.
Do not impose this recording on every read or ordinary command.

Before a long wait, handoff, or known context change, save the current state and
concrete continuation. A timed wait records the operation ID, readiness condition,
and next check time where applicable. Notes do not wake the agent; future execution
requires an available authorized mechanism.

Within one context, use already-read current information. Reread after resume,
external changes to a record, or when previously unloaded detail is needed. Read
the effective order, current branch, and relevant originals rather than the entire
archive. Keep references from a normal context handoff to this same notebook.

Reduce repetition and link detail; impose no hard limit on lines, tokens, depth,
documents, or amendments that would cut required substance. Record findings with
their sources and applicability, and distinguish confirmed facts from unknowns.

## Evidence and reports

Link requirement → expected result → actual action → observation → conclusion.
Preserve the required exact commands, authorization or tokens and identities,
payloads, queries, responses, and execution conditions from actual records. Never
reconstruct an exact trace from memory. Documentation supports the expectation;
the original result supports the observation. Cite the relevant section and, when
material, version or date; use line numbers only when they locate real source text.

Reference an existing durable original instead of duplicating it. A temporary link
or automatically removed packet cannot be the only long-term evidence. Preserve
needed originals before they become unavailable. Keep the owner's rules for secret
values and locations; replacing this skill does not authorize migrating secrets.

A checked TODO means an action is complete. Its evaluation can be PASS, FAIL, or
insufficient grounds. Required blocked work remains unfinished. A report's existence
is not proof of completion. Evidence depth follows the task: analysis may finish
through reading and logic, while requested testing requires its actual observations.
This skill adds no tests, audits, bug fixes, reviews, or external actions.

## Resume and close

On restore, inspect only the notebook header first. Check the session, task identity,
selection source, and status against the current request. Load and apply this skill
only for the same continuing explicitly selected task in `working`, `waiting`, or
`blocked` status. A complete, cancelled, or unrelated notebook does not restart work
or enable the skill for a new order. Apply new user amendments before dependent work,
then load the current branch and required originals. Recheck only material mutable,
missing, contradicted, or invalidated grounds.

Automatic location depends on the `scope-focus-bootstrap` skill supplying the
locator for the current Kimi session id. Kimi SessionStart hook output is
discarded by the host, so the hook cannot deliver the locator; the bootstrap
skill text is the delivery channel. For a different session, require a supplied
notebook path and an explicit relationship to the task; do not search other
sessions or silently reassign their records.

At a part's completion, finish its work record with the result, meaningful chronology,
problems, solutions, and evidence links. Only after saving those grounds, collapse
the branch into its short status and link. Preserve the detailed completed work.

At whole-task completion, reconcile the actual result with the effective order and
all applicable amendments. Save the notebook outcome with those conditions, the
result, unresolved matters, and links to part records. Reuse a suitable existing
final report at the user's required destination; otherwise write the task's report
in its stable task-key directory. Resolve links against their actual locations.
Only then shorten `plan.md` to the completed header, outcome, and report locator.

A later independently selected task in the same session gets a new task key.
Replace the entry plan only after preserving the prior task's outcome; keep its
record paths and links unchanged. For a pause, cancellation, or blocker, save the
actual state without claiming completion. Never delete a notebook automatically.
Cleanup is separately authorized and must preserve records required for continuation
or later use. Legacy Goal Memory data is not migrated or deleted by this replacement.

## Existing workflows

Keep Goal definition and native status with the selected Goal workflow. When Context
Router is enabled, link this notebook from its checkpoint and use relevant exact
history records; do not maintain a second independent plan there. Neither Context
Router nor Lunatron is a dependency. Follow the environment's existing roles and
selected review process without adding workers or review cycles through this skill.
