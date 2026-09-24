---
name: notebook-cleanup
description: Delete the entire Task Notebook for the current Codex session when explicitly invoked, including older completed task records.
---

# Notebook Cleanup

Use only on explicit invocation. The invocation authorizes removing the whole
Task Notebook directory for this Codex session, including completed records.
Do not wait for task completion or ask for a second confirmation.

Take the current `session_id` and Task Notebook plan locator from Scope Focus
SessionStart. With Node.js built-ins, compute `sessionKey` as
`Buffer.from(session_id, 'utf8').toString('hex')`, then compute the exact target
as `path.join(os.tmpdir(), 'scope-focus', 'task-notebook', sessionKey)`.
Require a nonempty session ID and require the supplied plan locator to equal
`path.join(target, 'plan.md')`. Never infer a session from a directory listing,
an old notebook, or another task.

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
