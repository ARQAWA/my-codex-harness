---
name: restore-session
description: "On explicit request, recover this session's decisions from the full saved history, then rebuild its remaining todo."
---

# Restore Session

Run only when the owner explicitly invokes this skill or asks to reconstruct an old session. This restores memory and the work list; it does not authorize executing the recovered work.

1. Use `Decisions CLI` and `History CLI` from the root session context. Run `node "<Decisions CLI path>" rebuild` for the current `CODEX_THREAD_ID`. The recorder captures an immutable snapshot of the original saved history at invocation, including messages before compaction, and reads it chronologically on `gpt-6.1-sol` with effort `low`, without a filter. Do not substitute the current context or compaction summaries for that history. The live rollout keeps growing as restoration runs; do not chase those new tool outputs as part of the captured old history.
2. If the owner supplied another session ID or a rollout path, pass it with `--session ID` and `--path FILE` as applicable. Keep that session's registry separate from the current session's registry. Never merge another session's authority into this one. If the source cannot be read or coverage is incomplete, report the exact limitation; do not announce full restoration.
3. Read the rebuilt registry with `node "<Decisions CLI path>" show`, using the same session selection. Read the entire output or its referenced registry file, including its coverage and source snapshot path. Use that same snapshot for todo reconstruction. Keep the owner's exact quotes and accepted proposal text as the evidence of agreement. Cancelled, replaced and rolled-back rules are not current instructions. A decision applies only to its original scope.
4. Read [Restore Todo](../restore-todo/SKILL.md) and follow it for the same source session. Decisions come first; todo reconstruction follows only after the registry is available. If recording failed, stop without replacing the existing todo.

Report briefly what was restored and any missing history. Do not start the recovered project work until the owner's request also authorizes continuing it.
