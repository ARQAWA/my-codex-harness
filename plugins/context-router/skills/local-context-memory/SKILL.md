---
name: local-context-memory
description: Preserve and restore task context with local checkpoints, stage summaries, and exact history records across Codex context windows and subagents.
---

# Context Router

Use the bundled Node CLI. It stores notes and indexed history in the user's local
SQLite database. It does not use MCP.

Use the actual `node_path`, `cli_path`, `settings_path`, and owning `thread_id`
from bootstrap. Without bootstrap, the CLI is `memory.js` two directories above
this skill's directory; resolve its absolute path. The owner's `CODEX_THREAD_ID`
can identify its thread before delegation. Pass that literal ID with
`--thread-id` when a configured executor performs the call. The executor's own
thread ID must not replace the owner's ID.

## Start or resume

Use the bootstrap injected by `SessionStart` or `SubagentStart` when it is
present. Call `context.bootstrap` once only when no injected bootstrap exists,
including a child reset or resume path that does not run `SubagentStart`.
Continue from the checkpoint in that response. Do not read the same checkpoint
again when its full text is already present.

Restore the effective user order and its amendments before choosing the next
action. Newer explicit user instructions replace only conflicting older ones.
When Task Notebook was explicitly selected, read its current locator and current
order; it remains the working plan. Do not create a competing plan in SQLite or
activate Goal, Task Notebook, or a review merely because a window changed.

Use `user_refs`, the checkpoint table of contents, and history search to choose
only records needed by the current work. Read an exact record with
`history.read_item`. Use `format: "raw"` when the original stored JSON is needed;
use the default `text` form for normal reading. Follow `next_offset_chars` until
the chosen record is complete.


## Save context

Keep `/root/notes/checkpoint.md` current when a completed stage, changed decision,
user amendment, or pending wait materially changes continuation. Save before
leaving the window. Batch related facts; do not write after every tool call.
These are virtual note paths scoped to the owning thread in SQLite.

Without a selected Task Notebook, the short checkpoint contains:

- the current objective, effective user amendments, and accepted constraints;
- completed work and important decisions;
- exact changed paths and current state;
- remaining work, pending operations or unresolved results, and the next action;
- links to stage summaries and relevant history `window_id` and `item_id` values.

When Task Notebook is selected, store its exact current locator and a short
continuation state instead of duplicating its plan and notes. Detail goes into
`/root/notes/stages/<stage>.md` only when needed for continuation and not already
stored in the selected notebook or a linked original.

On a budget reminder, finish the current safe step, save through the configured
executor, and confirm the write succeeded. If work remains, call native
`new_context` and resume from bootstrap. If the requested result is already
complete, finish normally. Use `get_context_remaining` only when it affects the
next action, not after every tool. Do not request a summary of the whole old window.

The bundled hooks save ordinary inter-agent send and follow-up inputs and results
as `harness_record` history entries. `history.record` is also available when a
normal Harness path must save an original record explicitly. Do not create a
parallel log, queue, acknowledgement, or health state.

## Failures

If a normal context read or write returns an actual error, report the exact error.
A subagent reports it to its parent; the root agent reports it to the user. Continue
from context that is still available. Do not call an uncertain write successful
or silently replace this workflow with a whole-window summary. A forced reset
can recover only saved state and available history, not an unsaved checkpoint.

## CLI

Send one JSON object on stdin:

```text
node memory.js call OPERATION [--thread-id ID] [--settings PATH]
```

The request may contain `request_id` and an `args` object. Mutating operations use
`request_id` for idempotency. Success is
`{"version":1,"request_id":"…","result":{…}}`; failure contains `error`.

Operations:

- `context.bootstrap`: empty args.
- `notes.write_file`, `notes.append_to_file`: `path`, `text`.
- `notes.read_file`: `path`, optional `start_line`, `stop_line`.
- `notes.list_files_by_prefix`: optional `prefix`, `max_results`, ordering fields.
- `notes.search_contents`: `query`, optional note filters and limits.
- `history.list_windows`: optional `limit`, `recent_first`.
- `history.list_items`: optional `window_id`, `role`, tool filters, limits.
- `history.read_item`: `item_id`, optional `window_id`, `format`,
  `offset_chars`, `limit_chars`.
- `history.search_contents`: `query`, optional history filters and `limit`.
- `history.record`: `stable_id`; optional `origin_thread`, `window_id`, `role`,
  `text`, `raw`, `payload`, tool fields, and `refs`.

Honor cursors, `has_more`, `truncated`, and embedded `history_error` values. A
successful note write with `history_error` means the note was saved but history
import failed; report that actual import error without discarding the note.
