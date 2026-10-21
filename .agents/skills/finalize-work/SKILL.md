---
name: finalize-work
description: "Release-time finalization done by Main without reviewers: reconcile the installed copies with their sources and make the documentation reflect every released change."
---

# Work finalization

Run during a release before the squash merge into `master` and push. Ordinary handover, task-branch stage commits, discussion and read-only analysis do not start this gate. Finalization alone authorizes no publication or installation.

Main does both checks itself and launches no reviewer: a reviewer runs only when the owner asks for a review.

## Prepare

Incorporate current `master` in the task worktree. Main establishes the active Codex home (`CODEX_HOME`, usually `~/.codex`), compares the file pairs below with `cmp`, reads the installed `scope-focus` version from `codex plugin list --json`, and reads `git diff --find-renames master...HEAD` and its changed paths. Exclude credentials, secrets, account data and unrelated settings.

## Installed copies check

| Installed | Repository source |
|---|---|
| the file named by `model_instructions_file` in `config.toml` | `new-model-instructions.md` |
| `<CODEX_HOME>/agents/<name>.toml` for every profile in `plugins/scope-focus/agents` | `plugins/scope-focus/agents/<name>.toml` |
| the installed `scope-focus` version | `version` in `plugins/scope-focus/.codex-plugin/plugin.json` of `master` |

The criterion is that the owner's local changes to the installed copies are reflected in their repository sources and deliberate task changes will be installed by their installation instructions. For every differing pair, read its diff: carry a local owner change into the source, or leave a deliberate source change to the installation step. Ask the owner in chat if the direction is unclear. The version change that this release's own cachebuster makes is a deliberate task change installed by the update step.

## Release documentation

The criterion is that every changed fact agrees with the code and all documents that state or rely on it. All changed names, values, counts, paths, commands and behavior need their required references. Read the complete release diff and changed files, then search removed or renamed elements and other changed facts across the repository, including unchanged documents, and fix every obsolete reference; leave history in Git, not archives or removal notes. Do not fix unrelated historical drift or add cleanup outside the changed contract.

## Completion

Merge and push require both checks to end with no open difference. These checks add no test runs: reuse existing test evidence for unchanged tested inputs. Report the finalization results at release handover.
