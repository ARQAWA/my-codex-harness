---
name: astro-review-cycle
description: Run only when explicitly invoked for one fresh blind CLEAN pass with Bossy (gpt-6-astra / low) and an autonomous batch-fix loop.
---

# Astro Review Cycle

Use only on explicit invocation. Select `agent_type=bossy` (`gpt-6-astra`,
reasoning `low`) and one clean pass per checkpoint.

Read and follow the [shared blind contract](../high-review-cycle/SKILL.md),
including target selection, `review_stage` (`pre-action` or `pre-completion`),
the frozen object and packet, fresh read-only reviewers, finding admission,
and batch repair. Preserve Bossy and the single-pass requirement after repairs.
Reading the shared contract does not select Smarty or launch another cycle.
