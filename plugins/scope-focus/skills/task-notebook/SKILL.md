---
name: task-notebook
description: Keep a short notebook for multi-stage tasks with amendments, waits, handoffs, or likely context loss, or on a direct request.
---

# Task Notebook

Use automatically for a task that spans several turns, receives user
amendments, waits on operations, hands work to another session, or is likely
to lose context; a task finished in one turn without these needs none. A
direct `$task-notebook` request forces it; an explicit prohibition wins.
Without a session id, skip it. The notebook grants no authority.

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
other calls. Record no per-step expectations or results. When the task is
complete, print it and delete it in the batch with the last work call, chained
after that work: plain `rm` of `plan.md`, then `rmdir` of its folder; Codex
rejects forced deletion such as `rm -f`. Check every requirement against the
result before the final answer. Keep it on a pause, wait, or block, or when the
user asks to keep it.
