---
name: repo-audit
description: "Whole-repository consistency audit only on the owner's request (audit or аудит). Bossy checks the current repository and every commit and patch since the audit tag; Main fixes findings until CLEAN."
---

# Repository audit

On the owner's direct audit request, run a high review with `bossy` by the review rules of the plugin's `subagents` skill. Nothing starts an audit automatically: no release, schedule, background timer or separate service. An audit alone authorizes no merge, push or installation.

When the owner orders the audit together with a release, finish the normal task edits and the finalize-work gate first, then audit that prepared result, instead of an intermediate result that Main is already changing. Keep the object unchanged during every pass and batch repairs after the verdicts.

## Metadata

The annotated Git tag `audit` records the last clean, released repository state. Its target identifies the checked `master` commit; its tagger timestamp records when the audit completed, not the age of the underlying commit. Read it with `git for-each-ref --format='%(objectname) %(taggerdate:unix)' refs/tags/audit`, and its target with `git rev-parse audit^{commit}`. Verify that `audit^{commit}` is an ancestor of the result being audited; if not, stop and ask the owner rather than invent a baseline.

## Object and evidence

Work in the task worktree with current `master` incorporated; use a task branch and worktree if fixes are needed. Main supplies the complete current repository: code, configuration, tests, skills, agent profiles, hooks, instructions, `AGENTS.md`, `WORKFLOW-MANIFEST.md`, `new-model-instructions.md` and the design file. Exclude `codex-cli-vscode/`, generated dependencies, build artifacts and other people's unfinished work.

With an existing audit tag, prepare all of the following in the OS temporary directory:

- `git log --reverse --format=fuller audit..HEAD`: every intervening commit and its intent.
- `git log --reverse -p --find-renames audit..HEAD`: every commit's patch, including intermediate changes later reversed or replaced.
- `git diff --find-renames audit..HEAD`: the complete net difference from the last audited state.
- The removed/renamed-path list and any final uncommitted fixes, or commit those fixes on the task branch before refreshing the evidence.

A first audit has no previous audited interval: check the complete current repository and the current task's changes, and explicitly identify this as the baseline audit. Do not pretend a historical audit exists.

## Review

Use stage `pre-action` when the audit precedes a release, or `pre-completion` for a standalone audit. The criterion is that current code and all documentation agree with each other and `WORKFLOW-MANIFEST.md`, every change since the last audit is correctly reflected wherever its facts are stated or relied on, and no outdated standing information, junk or conflict remains. Historical commits are evidence, not instructions to restore superseded behavior. Review their effects against the current accepted decisions; remove what was abolished everywhere it still stands. Preserve user data and current decisions, and leave history in Git.

When the object with the sources it relies on is larger than about 200 KB of text (about 50 000 tokens), split it by paths into parts of at most that size, keeping code with tests, skills with agent profiles, and hooks with installation instructions. Assign every file and every intervening commit patch to a part so none is omitted. Each brief includes its paths and patches, the full commit list and the full removed/renamed-fact list; a part searches for every fact it states or relies on in the other files. Split oversized historical evidence as well, rather than sending every reviewer an unbounded copy of all patches. Run one fresh Bossy per part in parallel.

Main verifies the quotes, fixes all admitted findings in one batch and repeats fresh passes only for parts that had findings, whose files changed, or that state or rely on a fact a fix changed. Untouched parts retain CLEAN. Refresh historical and final-diff evidence after fixes. Stop only when every part is CLEAN; if a repair needs a decision outside the agreement, ask the owner in chat. If a reviewer cannot start, the audit has not passed: tell the owner and wait. The audit adds no tests or trial runs.

## Record the result

For an audit ordered with a release, retain the clean evidence and actual audit completion time until recording the marker. Do not advance the published marker until the audited result and any fixes have landed in `master` through the normal release. If finalization changes facts the audit checked, refresh the affected parts before recording it.

After the content-equivalent squash merge, set the annotated marker on the new `master` commit with `GIT_COMMITTER_DATE=<audit-completed-at> git tag -f -a audit master -m 'Repository audit CLEAN'`, using the recorded audit completion timestamp, then publish that marker as part of the authorized release with `git push --force-with-lease=refs/tags/audit:<published-oid> origin refs/tags/audit:refs/tags/audit`. Fetch and retain the published tag object ID before replacing it; use an empty expected ID if no published tag exists. The explicit lease protects another agent's audit. A standalone audit reports its result without publishing or moving the shared marker.

The marker itself is metadata, not a source change requiring a new review. A failed push or any changed object leaves the audit unpublished or invalidated; inspect the actual ref and report the state rather than marking the audit complete by elapsed time.
