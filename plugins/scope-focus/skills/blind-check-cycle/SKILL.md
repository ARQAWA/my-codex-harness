---
name: blind-check-cycle
description: Run only when explicitly invoked to independently check one frozen object with one fresh blind CLEAN pass and autonomous batch-fix loop.
---

# Blind Check Cycle

Use only on explicit invocation. MAIN owns fixes and completion.

The root agent orchestrating this task owns fixes and completion. It invokes the configured blind acceptance reviewer directly; do not add another manager or role layer for the check.

Honor the user's exact object, scope, checkpoint order, and selected pass count.
If the user does not specify checkpoints, select them automatically. Build the
check set from the mandatory final `pre-completion` cycle, then add the smallest
possible number of intermediate checkpoints that together cover every critical
dependency boundary; default to none. Only a material decision, prepared input,
or self-contained intermediate result can qualify, and only when it controls
substantial dependent work or an irreversible or materially high-impact action
and final-only detection would be too late to avoid substantial rework or impact.
Batch overlapping boundaries into one latest safe checkpoint before dependent work.
Routine reads, queries, commands, edits, updates, and configured-executor handoffs are not
checkpoints merely because they occur. Batch related material. If no critical
intermediate checkpoint is ready, do not spawn a reviewer before the final result.
The mandatory final cycle verifies the complete actual result and mutual
consistency among all applicable user requirements and amendments, binding
decisions, completed stages, and the final result; intermediate checks never
replace it. Do not repeat a final cycle
already passed on the materially unchanged result and grounds. An explicit
plan-only check does not require review of future implementation.

Within the authorized scope, every pass covers all work completed for the current
order: applicable user requirements and amendments, binding decisions, current
results of completed stages and their relationships, the current overall result,
and sufficient factual evidence. Check accuracy, adequate quality, consistency,
missing requirements due by this stage, and truthful readiness claims. Preserve
mandatory user procedure/order and apply later explicit changes over superseded
ones. Do not demand future work at an intermediate stage. After repair, review
the full updated object, not only the last diff or previous findings. Reuse valid
evidence; do not replay the entire execution log or rerun checks for confidence.

Set `review_stage=pre-action` for a selected gating object, and complete that check
before its actual dependent action. Set `review_stage=pre-completion` for the
completed result and its evidence. Keep the reviewed object and applicable
grounds materially unchanged during a pass and between the two double passes;
if they materially change, apply the selected cycle's existing restart rules.
Frozen means unchanged, not copied or packaged into another file.

Send one ordinary compact message with the original user request and current
amendments, binding approved material, scope, stage, result locators, relevant
persistent delta, and the smallest sufficient factual evidence. Use existing
readable source paths; for chat-only requirements provide the relevant original
user text without losing conditions, not the whole conversation. MAIN's summary
may orient but never replace primary requirements. Prior factual results and
necessary procedure evidence are allowed; private root-agent reasoning, prior review
findings/verdicts/streak, and inherited role context are not. Do not create
mandatory freeze files, copies, review archives, manifests, hashes, or preparation
scripts. A missing fact matters only if it prevents establishing a concrete
applicable requirement, not because a reviewer prefers more material.

Do not create baselines, hashes, exhaustive inventories, per-file scans, provenance reconstruction, or extra artifacts only for review unless the user or Goal explicitly requires that exact artifact or no smaller proof can establish a material result.

For every attempt, use a fresh configured blind acceptance reviewer. Use the schema exposed by the current runtime: v1 uses only `agent_type=spotty`, `fork_context=false`, and the frozen packet as exactly one `message` or `items`; v2 uses only `agent_type=spotty`, `fork_turns="none"`, the frozen packet in `message`, and a non-empty `task_name`. Never mix schemas or add fields. If the compatible spawn tool or `spotty` role is unavailable, the selected check is unavailable and cannot pass; root-agent self-review is not a substitute. Never resume a closed or interrupted reviewer. It checks only substantial requirement→object/evidence and concrete change→authority mismatches under the configured reviewer's materiality gate.

Use the main prompt's common subagent-wait policy. If a reviewer hang is confirmed, interrupt that pass and use a fresh configured reviewer on the unchanged object. Never resume a closed or interrupted reviewer.

The reviewer verdict is exactly `CLEAN` or `FINDINGS:`. Every finding has exactly these fields:

```
REQUIREMENT: <requirement>
MISMATCH: <mismatch>
EVIDENCE: <evidence>
REQUIRED OUTCOME: <required outcome>
```

On `FINDINGS:`, MAIN treats each finding as a claim, not a command. Admit only
findings that satisfy the configured reviewer's materiality gate. If no findings
are admitted, count that pass as `CLEAN` and complete the single cycle; do not
change the result, add evidence, or retry. If any finding is admitted, batch-fix
all admitted findings, invalidate only affected evidence, rebuild the compact
packet, and use a new fresh configured Spotty. Repeat autonomously until one pass
has zero admitted substantial findings. The user's explicit invocation starts
the whole cycle; no new invocation is required after a repair. Do not add a
second clean pass.
