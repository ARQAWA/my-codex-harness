---
name: light-review-cycle
description: One fresh blind Spotty (gpt-6.1-sol / low) pass to CLEAN with batch fixes, on explicit invocation or the Gold Standard's automatic pre-completion review.
---

# Light Review Cycle

Use on explicit invocation or for the Gold Standard's automatic pre-completion
review. Select `agent_type=spotty` (`gpt-6.1-sol`, reasoning `low`) and one
clean pass per checkpoint.

Read and follow the [shared blind contract](../blind-review-cycle/SKILL.md),
including target selection, `review_stage` (`pre-action` or `pre-completion`),
the frozen object and packet, fresh read-only reviewers, finding admission,
and batch repair. Preserve Spotty and the single-pass requirement after repairs.
Reading the shared contract does not select Smarty or start a Blind cycle.
For the automatic review, an unavailable Spotty means the review did not run:
say so and do not block.
