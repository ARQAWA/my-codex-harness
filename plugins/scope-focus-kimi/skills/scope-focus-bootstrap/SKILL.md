---
name: scope-focus-bootstrap
description: Session-start Scope Focus bootstrap. Provides the Task Notebook locator for the current session; locator only, never activation.
---

# Scope Focus Bootstrap

This skill loads automatically at session start. It provides one thing: the
Task Notebook locator for the current Kimi session. It does not activate Task
Notebook, Goal, or any blind review.

## Locator rule

The Task Notebook plan for a Kimi session lives only in the operating
system's temporary directory:

`os.tmpdir()/scope-focus/task-notebook/<session-key>/plan.md`

where `session-key` is the UTF-8 bytes of the Kimi `session_id` encoded as
hex (same scheme as the Codex original: `Buffer.from(session_id,
'utf8').toString('hex')`).

This locator is not activation and not permission to create a notebook. A
retained notebook or a lookup of its header never activates the
`task-notebook` skill.

## On session start or resume

1. If a plan file exists at the locator, read only its header first: session,
   task, explicit selection source, and status.
2. Only for the same continuing explicitly selected task in `working`,
   `waiting`, or `blocked` status, read the `task-notebook` skill and the
   current order, then apply newer user instructions before continuing. Do not
   load the skill or resume work for a `complete`, `cancelled`, or unrelated
   task. A new order requires a new explicit selection.
3. If the file is missing, continue only from available task sources and do
   not invent recovered state. The OS may clean the temporary directory; no
   hidden permanent copy is created.
4. If the session id or locator is unavailable, report this limitation only
   if Task Notebook is needed; continue compatible work with the available
   context.
