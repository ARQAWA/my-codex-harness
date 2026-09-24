---
name: blind-double-check-cycle
description: Run only when explicitly invoked to require two sequential fresh blind CLEAN checks on an unchanged frozen object.
---

# Blind Double Check Cycle

Use only on explicit invocation. Use the base target selection, `review_stage` (`pre-action` or `pre-completion`), packet, fresh `spotty` reviewer instances, single-pass criterion, finding schema, and repair evidence rules from `blind-check-cycle`; do not treat a whole one-CLEAN cycle as an opaque nested operation.

The root agent orchestrates exactly two strictly sequential fresh passes itself. Both passes use the base contract's fresh read-only `spotty` reviewer instances spawned through the `Agent` tool at medium effort and must be on the unchanged frozen object. A pass with zero root-agent-admitted material findings counts as one `CLEAN` pass and advances the clean streak, regardless of whether the raw reviewer label was `CLEAN` or `FINDINGS:`. Only admitted material findings reset the clean streak to zero and require repair plus two new fresh sequential passes. Rejected non-material findings authorize no change, extra evidence, or retry. Do not complete after a repaired object until exactly two sequential fresh `CLEAN` passes with zero admitted material findings are obtained unchanged.
