---
name: light-review-cycle
description: One fresh blind Spotty (gpt-6.1-sol / low) pass to CLEAN with batch fixes, on explicit invocation or when a selected procedure such as ToSpec requires it.
---

# Light Review Cycle

Use on explicit invocation or when a selected procedure such as ToSpec requires
it. Select `agent_type=spotty` (`gpt-6.1-sol`, reasoning `low`) and one clean
pass per checkpoint.

Read and follow the [shared blind contract](../blind-review-cycle/SKILL.md),
including target selection, `review_stage` (`pre-action` or `pre-completion`),
the frozen object and packet, fresh read-only reviewers, finding admission,
and batch repair. Preserve Spotty and the single-pass requirement after repairs.
Reading the shared contract does not select Smarty or start a Blind cycle.
