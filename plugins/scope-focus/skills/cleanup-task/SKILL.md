---
name: cleanup-task
description: Explicitly remove only proven task-created temporary artifacts after the result, evidence, and selected checks are complete.
---

# Cleanup Task

Use only when explicitly invoked. Defer cleanup until the result, required evidence, and every explicitly selected check are complete.

Remove only exactly proven task-created temporary or intermediate files, directories, staging, extracted copies, temporary downloads, obsolete intermediate cache/package versions, backups, and an explicit Goal Memory directory if present. Preserve deliverables, source/config/runtime result, final active cache/archive, research/report artifacts, and every pre-existing, user-owned, or ambiguous object.

Preserve Task Notebook plans, notes, work records, reports, and evidence needed for continuation or later use; its location in the OS temporary directory does not make these records disposable tool output; do not move or copy them into permanent storage as part of cleanup. Replacing a skill does not authorize deleting legacy Goal Memory data.

Before deletion, enumerate exact targets and recheck each target still matches the proof and exclusions. Prohibit `rm -f`, `--force`, and broad cleanup. Delete the explicit Goal Memory directory last among task-created temporary targets. Verify every target is absent and the result remains preserved.
