---
name: todo
description: "Root Main only: the todo list, your plan for the task, kept with the todo CLI."
---

# Todo

Your plan for the task lives in the todo CLI, whose path the session hook supplies as `Todo CLI`. Ops apply in order; on the first failing op the earlier ones stay and the result names its fix. Write an op as short text, `<op> [item][: text]`, parts split by `|`, one shell argument per op in single quotes: `node "<Todo CLI>" 'init Фаза: пункт | пункт' 'done 1.2' 'plan: шаг | шаг'`.
- `init Phase: item | item` (replaces the list), `append: item | item` or `append Phase: item` (a new phase name adds the phase)
- `start 1.3`, `done 1.2` or `done` for the current item (the next pending item starts by itself), `drop 1.2`, `block 1.4: reason`, `unblock 1.4`, `rm 1.5`
- `plan: step | step` (current item) or `plan 2.1: step | step`, `step` (next step) or `step 3`, `closed` (lists closed items)
Address items by number like 2.3 or by text. The object form {op, item, phase, list, items, reason, steps, step} also works as one JSON argument `{"ops":[...]}`. A successful change prints the current item and the open list; the open list also comes with every user message and after a compaction.

Run the CLI inside the same `exec` as the work calls it accompanies, started together with them, so the list costs no turn and no wait. Never spend a turn on the list alone while work goes on: put the change into the `exec` of your next work.

- Keep a list for every task that changes files or runs several stages of work: init it, in Russian with a named phase, in the `exec` of your first calls. Skip it for a question answered by reading, for one answer and for one short action.
- Each item is a concrete outcome: what will be true, where, and what shows it is done. When you start an item, give it a plan of concrete steps with the decisions they carry; mark steps as you go. A finding you will need again goes to its own file in the operating system's temporary directory, named in the item; reread those files after a context loss.
- Extend an unfinished list with append; drop an old list's remaining items before moving to a different task.
- Close the last items in the `exec` you expect to be your last, such as the final check: if its results show more work, `start` the item again in your next call. You cannot finish while items are pending or in progress: each is done, dropped or blocked with its reason, and a blocked item means your last message names the blocker and that you wait for the user.
