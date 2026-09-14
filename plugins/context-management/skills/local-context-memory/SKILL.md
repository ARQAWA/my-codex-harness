---
name: local-context-memory
description: Preserve and restore task context with local checkpoints, stage summaries, and exact history records across Codex context windows and subagents.
---

# Local Context Memory

Use the bundled Node CLI. It stores notes and indexed history in the user's local
SQLite database. It does not use MCP.

## Start or resume

Use the bootstrap injected by `SessionStart` or `SubagentStart` when it is
present. Call `context.bootstrap` once only when no injected bootstrap exists,
including a child reset or resume path that does not run `SubagentStart`.
Continue from the checkpoint in that response. Do not read the same checkpoint
again when its full text is already present.

Use `user_refs`, the checkpoint table of contents, and history search to choose
only records needed by the current work. Read an exact record with
`history.read_item`. Use `format: "raw"` when the original stored JSON is needed;
use the default `text` form for normal reading. Follow `next_offset_chars` until
the chosen record is complete.


## Save context

When Codex reports that the token budget requires a new context window, first
save the completed stage in `/root/notes/stages/<stage>.md`. Then write
`/root/notes/checkpoint.md` with:

- the current objective and accepted constraints;
- completed work and important decisions;
- exact changed paths and current state;
- remaining work and the next concrete action;
- links to stage summaries and relevant history `window_id` and `item_id` values.

Keep the checkpoint short. Put detail in stage notes and exact history records.
After the successful checkpoint write, use the normal Codex new-context-window
flow. Do not ask a model to summarize the whole old window.

The bundled hooks save ordinary inter-agent send and follow-up inputs and results
as `harness_record` history entries. `history.record` is also available when a
normal Harness path must save an original record explicitly. Do not create a
parallel log, queue, acknowledgement, or health state.

## Failures

If a normal context read or write returns an actual error, report the exact error.
A subagent reports it to its parent; the root agent reports it to the user. Continue
from context that is still available. When the error prevents recovery, the user
or root agent may request the ordinary full-summary compaction available in the
current Codex UI or command after the error is reported. This is a manual emergency
path; do not claim that TokenBudget switches to it automatically.

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
