---
name: double-light-review-cycle
description: Run only when explicitly invoked for two sequential fresh blind CLEAN passes with Spotty (gpt-6-sol / low) on an unchanged frozen object.
---

# Double Light Review Cycle

Use only on explicit invocation. Select `agent_type=spotty` (`gpt-6-sol`,
reasoning `low`) and two clean passes per checkpoint. This is a fixed double
Light cycle, not a modifier for High or Astro Review Cycle.

Read and follow the [shared blind contract](../high-review-cycle/SKILL.md):
target selection, `review_stage` (`pre-action` or `pre-completion`), packet,
single-pass criterion, finding schema, and repair evidence rules. Preserve Spotty
and the two-pass requirement; reading the shared contract does not launch High
or an additional single cycle. Do not nest whole one-CLEAN cycles.

The root agent orchestrates exactly two strictly sequential fresh passes itself.
Both passes use Spotty and must be on the unchanged frozen object and applicable
grounds. A pass with zero root-agent-admitted material findings counts as one
`CLEAN` pass and advances the clean streak, regardless of whether the raw label
was `CLEAN` or `FINDINGS:`. Admitted material findings require batch repair and
reset the streak to zero. Material changes to the object or applicable grounds
also reset the streak. Obtain two new fresh sequential clean passes after a
reset. Rejected findings authorize no change, extra evidence, or retry. Stop
when the two clean passes have been obtained without changes between them.
