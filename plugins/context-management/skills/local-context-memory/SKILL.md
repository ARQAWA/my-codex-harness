---
name: local-context-memory
description: Restore local Codex context from the installed memory CLI and checkpoint after a context-window transition.
---

# Local context memory

Requires Node.js 24.5 or newer. Use the installed local CLI and local SQLite
database. This does not replace Codex history, token accounting, or
`functions.new_context`.

## Identity and CLI

Use the exact `thread_id` from `CODEX_THREAD_ID`. Do not infer it from the
current directory, project name, latest file, or model. Installation settings
provide `node_path`, `cli_path`, `skill_path`, and `settings_path`.

Run one CLI call with JSON on stdin and keep its `request_id`:

```sh
printf '%s' '{}' | "$NODE_PATH" "$CLI_PATH" call context.bootstrap \
  --thread-id "$CODEX_THREAD_ID" --settings "$SETTINGS_PATH"
```

Use the returned installation paths exactly. Calls in one session are
sequential. Do not start a background memory service, write SQLite directly, retry an
uncertain write, or call a provider.

## Start and restore

At task start and after a context reset:

1. Call `context.bootstrap`.
2. Confirm `thread_id`, source status, and source boundary.
3. If `checkpoint.path` exists, call `notes.read_file` with that exact path.
4. Read every `user_refs` item with `history.read_item`, using its exact
   `window_id` and canonical `item_id`.
5. If there are no links, use `history.list_windows`, then
   `history.list_items` or `history.search_contents` and read matching items.

Treat checkpoint and history as evidence with a source boundary. An empty
result is not proof that history is empty when source status is not `ready`.
Do not restore an old cancelled request over a new user request.

## Checkpoints and transitions

After a meaningful decision or completed stage, write the complete current
state to `/root/notes/checkpoint.md` with `notes.write_file`. Include the goal,
constraints, decisions, completed actions, proven results, exact source and
item links, and next step. The CLI returns an atomic `revision` even when the
source is `catching_up` or `partial`; that does not mean all history is ready.

When a token-budget reminder appears, finish only the current safe action,
write the checkpoint, and wait for a successful result with its `revision`.
Do not call `functions.new_context` after an error, timeout, or unknown write
result. Keep the request id so the same request can be checked without
duplicating a write; use a new id for an intentional new append.

After a confirmed checkpoint, and only when the normal transition is
appropriate, call native `functions.new_context`. The CLI has no reset command.
When updating this skill, reread the complete skill file. After reset, repeat
bootstrap, checkpoint read, and linked history reads. Use
canonical item ids without shortening them. Read opaque or image attachments
only through a client that can display them; do not turn base64 into text.

Source status `catching_up` means later bounded bootstrap or history calls must
continue the import. `partial` and `source_*` errors do not represent complete
history.

## CLI operations

Send one JSON object on stdin to `call OPERATION`.

| Operation | Required fields | Optional fields |
| --- | --- | --- |
| `notes.write_file` | `path`, `text` | — |
| `notes.append_to_file` | `path`, `text` | — |
| `notes.read_file` | `path` | `start_line`=1, `stop_line`=last |
| `notes.list_files_by_prefix` | — | `prefix`=`/root/notes/`, `max_results`=100, `file_order_by`=`name`, `file_order`=`ascending` |
| `notes.search_contents` | `query` | `path_prefix`=`/root/notes/`, `max_files`=100, `max_matches_per_file`=20, `recent_file_first`=true |
| `history.list_windows` | — | `limit`=100, `recent_first`=true |
| `history.list_items` | — | `window_id`, `role`, `tool_namespace`, `tool_name`, `limit`=100, `recent_first`=true, `max_chars_per_item`=2000 |
| `history.read_item` | `window_id`, `item_id` | `offset_chars`=0, `limit_chars`=10000 |
| `history.search_contents` | `query` | `window_id`, `role`, `tool_namespace`, `tool_name`, `limit`=100 |

`context.bootstrap` takes an empty object. The CLI envelope always carries
`version: 1`, a nonempty `request_id`, and the thread id.

Chosen prototype limits: stdin 8 MiB, note 1,000,000 UTF-8 bytes, output
64 KiB, JSONL line 16 MiB, 256 records and about 4 MiB per import call,
64 KiB reads, recursion depth 32, and a 5-second database busy timeout.

## Scope

Notes are thread-local. Absolute paths may be used only when returned by the
CLI or explicitly supplied by the user. A parent fork prefix is visible
only through an explicit history boundary. Never follow all `forked_from_id`
records or a parent task's later tail.
