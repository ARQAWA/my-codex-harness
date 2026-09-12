---
name: mixed-blind-check-cycle
description: Run only when explicitly invoked to use one fresh blind CLEAN pass at each automatically selected intermediate checkpoint and two sequential fresh CLEAN passes on the complete final result.
---

# Mixed Blind Check Cycle

Use only on explicit invocation. MAIN owns fixes and completion.

Use the automatic checkpoint selection and all reviewer, packet, evidence,
frozen-object, materiality, repair, and waiting rules from `$blind-check-cycle`.
Honor the user's explicit object, scope, checkpoint order, and amendments; add no
checkpoint beyond that contract's minimum selected set.

At each selected intermediate `pre-action` checkpoint, run exactly one fresh
CLEAN cycle under `$blind-check-cycle`.

On the mandatory complete final `pre-completion` result, run exactly two strictly
sequential fresh CLEAN passes on the unchanged frozen result under the streak and
restart rules from `$blind-double-check-cycle`. Intermediate passes never count
toward the final clean streak.
