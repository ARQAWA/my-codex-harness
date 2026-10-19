---
name: finalize-work
description: "Release-time finalization: reuse unchanged Spotty evidence for the installed copies and combine the task and release-documentation criteria in one work-class review. Micro releases use a diff-only Spotty; a due Bossy audit runs after ordinary repairs and covers documentation consistency."
---

# Work finalization

Run during a release before the squash merge into `master` and push. Ordinary handover, task-branch stage commits, discussion and read-only analysis do not start this gate. Finalization alone authorizes no publication or installation.

## Prepare

Incorporate current `master` in the task worktree. Main establishes the active Codex home (`CODEX_HOME`, usually `~/.codex`), compares the file pairs below with `cmp`, reads the installed `scope-focus` version from `codex plugin list --json`, and prepares `git diff --find-renames master...HEAD` and its changed paths. Include subsequent uncommitted fixes in refreshed evidence, or commit them to the task branch before regenerating it. Keep temporary reviewer evidence in the OS temporary directory; exclude secrets and machine-specific data.

The installed-copies check and the documentation check remain separate checks with separate inputs and coverage. Run every reviewer by the review rules of the plugin's `subagents` skill and the rules below; do not start another reviewer merely because the task reached a new stage or got a new commit ID.

## Parts and reuse

When a reviewed object with the sources it relies on is larger than about 200 KB of text (about 50 000 tokens), split it by paths into parts of at most that size, keeping related files together, so that no file is left out, and launch a reviewer for every part in one response. After fixes, launch fresh reviewers only on the parts the fixes touch: a part that had findings, whose files changed, or that states or relies on a fact a fix changed. An untouched part keeps its CLEAN.

Before reuse, establish from existing retrievable review evidence what agreement, criteria, contents and dependent facts the actual verdict covered, and compare them with the current object. No new file, storage method, metadata format or set of note fields is required. A new commit ID, staging or a content-equivalent squash is not itself an invalidation. Changed agreement, checked content, dependent facts or criteria invalidates the affected coverage. Missing evidence requires the corresponding check, not an invented CLEAN. A combined pass covers only the criteria actually checked. If a reviewer cannot start, the check has not passed: tell the owner and wait.

## Installed copies check

| Installed | Repository source |
|---|---|
| the file named by `model_instructions_file` in `config.toml` | `new-model-instructions.md` |
| `<CODEX_HOME>/agents/<name>.toml` for every profile in `plugins/scope-focus/agents` | `plugins/scope-focus/agents/<name>.toml` |
| the installed `scope-focus` version | `version` in `plugins/scope-focus/.codex-plugin/plugin.json` of `master` |

Compare the current inputs with the last actual Spotty CLEAN using retrievable existing evidence, such as an existing reviewer-result artifact. The verdict covers only the input contents and criterion actually reviewed; it is not authority to skip changed or unchecked inputs. No additional file name, storage location, metadata format or service is required. Exclude credentials, secrets, account data and unrelated settings.

The evidence must establish the actual Spotty verdict, its checked criterion and scope, both sides of each file comparison, the installed version and the installation instructions that define the installed-copies contract. Use existing evidence rather than imposing a new record schema.

Recompare live inputs at each release. Reuse CLEAN only when its evidence exists and every checked file content, version, scope and criterion still matches. An unrelated document edit, staging or a content-equivalent squash does not invalidate it. The version change that this release's own cachebuster makes after the check is a deliberate task change installed by the update step and does not invalidate it either. Changed inputs, an actual mismatch, incomplete evidence or no prior CLEAN requires a fresh `spotty` review of stage pre-action.

Give Spotty the comparisons; equality evidence suffices for equal pairs, and differing pairs need their diff. Its criterion is that the owner's local changes to the installed copies are reflected in their repository sources and deliberate task changes will be installed by their installation instructions. This check covers installed copies, not unrelated documentation or the task agreement.

Main reconciles admitted differences: carry a local owner change into the source, or install a deliberate source change by its instruction. Ask the owner in chat if the direction is unclear. After repairs, recompare and repeat fresh Spotty passes until CLEAN, then retain the evidence of that actual result where Main can retrieve it at the next release. Never infer Spotty CLEAN from equality alone or from a repository audit.

## Task and release documentation

The documentation criterion is that every changed fact agrees with the code and all documents that state or rely on it. All changed names, values, counts, paths, commands and behavior need their required references. Search removed or renamed elements across the repository and clear obsolete references wherever they stand; leave history in Git, not archives or removal notes. Read the complete release diff and changed files, then use targeted searches to find dependent documents, including unchanged ones. Do not audit unrelated historical drift or add cleanup outside the changed contract.

Classify the task by the work-class table of the plugin's `approval` skill: micro, small for up to 5 requirements and up to 5 changed files, large for more. For small or large tasks, the required class pass must combine this criterion with the task agreement (the user's own words, his answers and the proposals he accepted): Spotty for small, Smarty for large, one brief containing both criteria, the full diff and dependent sources. When Main already obtained that combined coverage before the release, reuse its CLEAN while all covered inputs and grounds match. If a class CLEAN was already obtained without documentation coverage, retain it and run only the missing documentation check with Spotty. When both criteria need a fresh review, use one combined class pass rather than two overlapping reviewers.

Micro has no handover class review; at release, obtain the documentation coverage with a diff-only Spotty unless an unchanged covering result already exists. A CLEAN [repo-audit](../repo-audit/SKILL.md) on the prepared result covers this documentation criterion, never installed copies or the required class review. When an audit is due, finish any required class check and ordinary repairs first, then obtain the documentation coverage from that audit instead of a duplicate diff-only pass. A combined class pass already obtained need not be repeated just because an audit follows.

## Completion

Complete normal edits and reconcile known differences of installed copies before launching review on a frozen result. Run independent checks in parallel; wait for their complete verdicts before one batch of repairs. Run a due repository audit only after ordinary work and its admitted findings are settled, then repair and recheck only the audit parts and prior checks whose files, values or dependent facts those repairs change.

Merge and push require valid CLEAN coverage for installed copies and documentation and any mandatory work-class review. Reuse unchanged coverage through staging, content-equivalent squash and installation. These checks add no test runs: reuse existing test evidence for unchanged tested inputs and repeat only a check whose coverage was affected. If a required reviewer cannot start, report the blocker and wait. Report the finalization results at release handover.
