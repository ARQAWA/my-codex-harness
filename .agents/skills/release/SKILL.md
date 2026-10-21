---
name: release
description: "Release, commit, push, sync or install my-codex-harness: tests and the finalize-work gate of installed copies and documentation, then cachebuster, squash merge, push and installation of the changed parts; no reviewer runs unless the owner asks; ordinary edits and stage commits do not trigger release."
---

# Release

General status and installation bounds: [INSTALL_FOR_AGENTS.md](../../../INSTALL_FOR_AGENTS.md).

The words release, commit, push and sync («релиз», «коммит», «пуш»,
«синхронизация» and their verb forms) each order one full release of this
repository as one package: the installed-copies check, every check and the
finalize-work gate, the cachebuster, the squash merge of the task branch into
`master`, push, installation on the current host and removal of the task's
branch and worktree. Merge and push require the finalize-work gate. A release
launches no reviewer and no audit unless the owner asks for one. They never run
without the rest of the package. The stage commits that `AGENTS.md` requires
during the work go to the task branch and are not a release. «Установить» or
«обновить» without them order installation only, by `INSTALL_FOR_AGENTS.md`,
without a merge or a push.
Every release reuses completed steps whose checked inputs and grounds still
match.

`<task>` is the task branch, `<worktree>` its worktree, and `<clone>` the main
clone on `master`.

1. In `<worktree>`, commit every remaining change of the task to `<task>` with
   `git add` of its exact paths, without other people's changes. If `master`
   has moved since the branch started, merge `master` into `<task>` and resolve
   the conflicts there, so that the checks and the gate see the result that
   will land.
2. Obtain the existing `node tests/run.mjs` result for the affected inputs: run
   once if no valid result exists for the changed code, configuration or
   document contracts it tests; fix a revealed failure and rerun its check.
   Apply [finalize-work](../finalize-work/SKILL.md). When the owner ordered an
   audit for this release, run [repo-audit](../repo-audit/SKILL.md) after
   that. Commit fixes to `<task>`.
3. If `plugins/scope-focus` changed, run
   `node tools/update-plugin-cachebuster.mjs scope-focus` once in `<worktree>`;
   Main commits the manifest to `<task>`.
4. In `<clone>`: squash merge only: `git merge --squash <task>`, then
   `git commit` with a message that sums up the task, then
   `git push origin master`.
5. If this release ran a CLEAN audit the owner ordered, move and publish its
   annotated `audit` tag on the new `master` commit by repo-audit's recording
   procedure.
   Otherwise leave the marker unchanged. A rejected tag lease is a blocker.
6. Install on the current host from `<clone>`: a changed plugin, only when its
   marketplace entry source points at this repository and its version matches
   the source commit, by the update
   section of [scope-focus.md](../../../install-instructions/scope-focus.md),
   a changed prompt by [system-prompt.md](../../../install-instructions/system-prompt.md).
   Reuse installed dependencies and unchanged installation evidence; run only
   affected checks from the selected instructions. Do not update unrelated
   components. Ask the owner to start a new Codex task.
7. In `<clone>`: `git worktree remove <worktree>` and `git branch -D <task>`
   (after a squash merge git does not count the branch as merged).

Add no service files for a release. The standard cachebuster is
`tools/update-plugin-cachebuster.mjs`; create no UI metadata or README.

## Errors

When a push or installation is uncertain, read the state first (`git status`,
`git log -1 origin/master`, `git worktree list`, `codex plugin list --json`)
instead of repeating blindly, report the unfinished stage and do not declare
the release complete.
