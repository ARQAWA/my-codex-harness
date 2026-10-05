---
name: cleanup-notebook
description: On a direct request, delete this session's Task Notebook, or with scope=current-task only the current task's records.
---

# Cleanup Notebook

Use only on a direct request; the Gold Standard recycles a completed task's
notebook inline. A direct invocation without a scope removes the whole Task
Notebook directory for this Codex session, including completed records, without
waiting for task completion or a second confirmation. Retention instructions,
requested Notebook results and required originals are exclusions.

## Whole-session public default

Take the current `session_id` only when it is explicitly available in the
Codex task context. With Node.js built-ins, compute `sessionKey` as
`Buffer.from(session_id, 'utf8').toString('hex')`, then compute the exact target
as `path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'scope-focus', 'task-notebook', sessionKey)`.
Require a nonempty session ID. If it is unavailable, delete nothing and report
that the current session's notebook cannot be identified. Never infer a session
from a directory listing, an old notebook, or another task.

If the target is absent, report that nothing needed deletion. If present, verify
the Scope Focus notebook root and target are real directories, not symlinks. When
`plan.md` exists, require it to be a regular file, not a symlink, and require its
`Session:` header to match the current session ID. Enumerate its contents and
recheck the exact target and exclusions before deletion. Do not follow links
outside the target, and do not delete other session directories, repository
files, or HTML reports stored elsewhere.

Delete only the verified target with `fs.rmSync(target, { recursive: true })`,
without `force` or globs. Confirm the target is absent afterwards and report the
result. If ownership or the target is ambiguous, delete nothing and report the
exact reason. Do not create a replacement notebook automatically.

## scope=current-task

Use only on an explicit request naming this scope. It never authorizes
whole-session deletion.
Wait for the actual substantive result, required evidence and every selected
or mandatory CLEAN, plus the closing notebook outcome with cleanup still pending.
Keep records needed for continuation while any of these conditions is unmet.

Require the exact task key, its relationship to this completed execution, and
either an explicitly available current `session_id` or an explicitly supplied
notebook `plan.md` path for the same selected task under Task Notebook's manual
continuation contract. Do not search for notebooks or infer the current session
from directories or old records. For a current session, compute the existing
session-key path above. For a supplied manual path, validate the original
`Session:` header against its session-key directory and the explicit relationship
to this task; do not reassign it to the current session.

Resolve the actual notebook namespace above with `fs.realpathSync`. Require the
notebook session directory to be directly inside it. The
namespace, session and task directories must be real directories, not symlinks;
the entry plan, when present, must be a regular file. Validate canonical
containment and every affected path component before mutation. A task key must
be one filesystem-safe basename, never a separator, `.` or `..`. Check `Session:`,
`Task:`, direct selection or automatic selection with its order source and need,
and the exact execution association. Main's supplied root locator takes priority
over a child's local hook locator; metadata alone grants no ownership. A supplied manual
path must pass the same location and ownership checks as a computed one.

Enumerate only the exact targets and exclusions. Remove the task-key directory
only when its contents are proven records of this execution; preserve required
originals, results, other tasks and every unknown or ambiguous entry. Unknown
ownership blocks deletion of that target, not permission to delete its parent.
Remove the session entry `plan.md` only if its header still names this execution.
If it now belongs to another task, preserve it and use established ownership
records for this task's directory; that different header is not authority to
remove another task. Missing or contradictory proof authorizes no deletion.

Recheck the exact paths, ownership, completion and exclusions immediately before
deletion. Use Node.js built-ins for the proven targets, without `force`, globs or
following symlinks. Remove session and namespace parent directories only if
actually empty; preserve other task keys and sessions. Confirm the selected
targets are absent and the exclusions remain afterwards. If already absent,
create nothing. Report the actual result or concrete limitation; do not create
a replacement notebook, migration or archive.

If required eligible deletion remains unfinished, preserve needed continuation
and report the concrete remaining work. Unknown or retained records are excluded
from automatic deletion, not permission to remove their parent. Do not claim full
completion while mandatory work remains.
