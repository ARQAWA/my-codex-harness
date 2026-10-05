---
name: task-notebook
description: Keep a short notebook for multi-stage tasks with amendments, waits, handoffs, or likely context loss, or on a direct request.
---

# Task Notebook

Use automatically for a task with several dependent stages, user amendments,
waits on operations, handoffs, or likely context loss. A direct
`$task-notebook` request forces it; an explicit prohibition wins. Without a
session id, skip it. The notebook grants no authority.

## File

Use `plan_path` from the hook's locator data:
`path.join(os.tmpdir(), 'scope-focus', 'task-notebook', Buffer.from(session_id, 'utf8').toString('hex'), 'plan.md')`.
For a delegated task, use the root path Main supplies.
Create only `plan.md` initially, with one command in the first work batch. If
`plan.md` holds another task that is still `working`, `waiting`, or `blocked`,
skip the notebook for this task; if it holds this task, resume it; otherwise
replace it.

Keep it to at most 10 lines. Status is `working`, `waiting`, `blocked`,
`complete`, or `cancelled`.

```text
Session: session_id
Task: short identity
Status: working
Requirements: exact requirements and values
Acceptance: what must be true at completion
Decisions: settled choices
Current step: step and resume condition
```

## Update and close

Update it only on an amendment, a wait, a handoff, or completion, batched with
other calls. Record no per-step expectations or results. Reread it before the
final answer and check every requirement against the result. Delete it in the
final batch when the task is complete. Keep it on a pause, wait, or block, or
when the user asks to keep it.
