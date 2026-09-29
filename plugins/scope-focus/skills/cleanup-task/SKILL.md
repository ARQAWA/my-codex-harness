---
name: cleanup-task
description: Explicitly remove only proven task-created temporary artifacts after the result, evidence, and selected checks are complete; includes finished ToSpec workspaces in OS tmp.
---

# Cleanup Task

Use only when explicitly invoked. Defer cleanup until the result, required evidence, and every explicitly selected check are complete.

Remove only exactly proven task-created temporary or intermediate files, directories, staging, extracted copies, temporary downloads, obsolete intermediate cache/package versions, backups, and an explicit Goal Memory directory if present. Preserve deliverables, source/config/runtime result, final active cache/archive, research/report artifacts, and every pre-existing, user-owned, or ambiguous object, except the explicitly scoped finished ToSpec material below.

Preserve Task Notebook plans, notes, work records, reports, and evidence needed for continuation or later use; its location in the OS temporary directory does not make these records disposable tool output; do not move or copy them into permanent storage as part of cleanup. Replacing a skill does not authorize deleting legacy Goal Memory data.

## Finished ToSpec material

The user selected OS temporary storage and later cleanup for ToSpec outputs.
Use only the exact workspace locator for the current task, never a search for
all matching folders or the newest folder. Read its spec/plan headers and current
task evidence (for an older three-document workspace, also read its existing
tasks header) to establish ownership and actual completion of implementation and
required checks, or the user's explicit instruction to discard this exact task.
`ГОТОВ К РЕАЛИЗАЦИИ` is not completed implementation. Keep pending plans needed
by another agent; do not delete them at the end of specification preparation.

The target must be a real task-created `scope-focus-tospec-*` directory directly
inside the actual Node.js `os.tmpdir()`, outside the repository. Recheck canonical
paths and symlinks; do not follow a link into another workspace. Within that exact
directory remove only proven task-created spec.md, plan.md and known
intermediate material; a tasks.md from an older completed workspace is removable
only with the same ownership and completion proof. Remove the directory only if
empty. Preserve unknown files, other tasks, notebooks and pre-existing repository
specs. Do not migrate, archive
or copy these documents into the repository as part of cleanup.

Before deletion, enumerate exact targets and recheck each target still matches the proof and exclusions. Prohibit `rm -f`, `--force`, and broad cleanup. Delete the explicit Goal Memory directory last among task-created temporary targets. Verify every target is absent and the result remains preserved.
