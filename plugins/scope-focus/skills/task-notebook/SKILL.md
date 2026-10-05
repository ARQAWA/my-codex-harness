---
name: task-notebook
description: Keep a working plan with draft decisions for a task with several dependent work stages, or on a direct request.
---

# Task Notebook

Use automatically for a task with several dependent work stages, such as
research, a plan, and step-by-step implementation or automation. A task whose
result is one answer, one document, or one short change needs none, however
much it reads, waits, or fills the context. A direct `$task-notebook` request
forces it; an explicit prohibition wins. Without a session id, skip it. The
notebook grants no authority.

The notebook holds the plan and the decisions that keep the stages consistent,
not the gathered context: the context and its compaction stay the short-term
memory.

## Files

Use `plan_path` from the hook's locator data:
`path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'scope-focus', 'task-notebook', Buffer.from(session_id, 'utf8').toString('hex'), 'plan.md')`.
For a delegated task, use the root path Main supplies.
Create only `plan.md` initially, with one command in the first work batch,
chained with the recycle command below run without `close`. If `plan.md` holds
another task that is still `working`, `waiting`, or `blocked`, skip the
notebook for this task; if it holds this task, resume it; otherwise replace it.

Status is `working`, `waiting`, `blocked`, `complete`, or `cancelled`.

```text
Session: session_id
Task: short identity
Status: working
Order: exact requirements, values, and acceptance
Plan:
  [x] 1. Map the order flow -> flow.md
  [ ] 2. POST /orders in api/orders.py: validates OrderIn, calls create_order
  [ ] 3. create_order(user, items) -> Order in services/orders.py; Order(id, items, total)
  [ ] 4. Tests for the endpoint and the service
Current step: 2, what is done and what comes next
```

Put a finding you will need again, such as a mapped flow, a data model, or an
important decision with its reasons, in its own file next to `plan.md`, named
by subject, and link it from the step. Find these files by listing the folder
and searching it like a repository.

## Work

Plan every stage you already understand and detail the nearest one as draft
decisions: where each piece of code goes, its interfaces and data shapes, and
the order of steps. Before each step, research it as deeply as it needs. When
a finding changes the plan, rewrite the affected future steps; a note on why
is optional. Update `plan.md` when a step completes, a decision or the plan
changes, or the user amends the order, batched with other calls, never per
tool call. After a context loss, read `plan.md` and the files it links before
continuing.

## Close

Check every requirement against the result before the final answer. When the
task is complete, set `Status: complete`, then, in the batch with the last work
call and chained after that work, run the recycle command with `close`: it
moves the notebook folder to `task-notebook-recycle` beside it and deletes
recycle entries older than seven days. Keep the notebook in place on a pause,
wait, or block, or when the user asks to keep it.

```bash
node -e 'const f=require("fs"),p=require("path"),d=p.dirname(process.argv[1]),b=p.join(d,"..","..","task-notebook-recycle"),n=new Date();f.mkdirSync(b,{recursive:true});if(process.argv[2]==="close"){const t=p.join(b,Date.now()+"-"+p.basename(d));f.renameSync(d,t);f.utimesSync(t,n,n)}for(const e of f.readdirSync(b)){const x=p.join(b,e);if(n-f.statSync(x).mtimeMs>6048e5)f.rmSync(x,{recursive:true})}' "<plan_path>" close
```
