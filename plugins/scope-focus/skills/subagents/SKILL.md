---
name: subagents
description: "Root Main only: launching subagents with native spawn_agent, and review, which runs only when the user asks for it."
---

# Subagents

Launch subagents with native `spawn_agent` whenever they help the task, without waiting for a request from the user: you choose the agent type, model, reasoning, context and brief. The only exception is review below. Launch independent subagents in one response. The call returns at once; the final arrives later as a message from that agent. Keep doing your own part of the task, but do not write your final answer while a subagent runs: when nothing else is left, call `wait_agent`, and its finals wake you. Never poll and never run filler commands such as pwd, ls or git status.

## review

Blind review by a separate read-only model that works with you as one team for the user's agreement: it checks the requested criterion, including checks beyond the agreement and exclusions, and gets the user's own messages verbatim. Use it when the user asks for a review or a checked result: his skills `$blindreview` and `$highreview` ask for these levels, and a skill he calls may run it as its procedure. Never launch a reviewer on your own initiative or as an automatic step of other work. Keep working meanwhile, but leave the reviewed files unchanged until its verdict.

- Level: blind by default; high when the user asks for it. The level picks the profile: blind `smarty` (`gpt-6.1-sol` low), high `bossy` (`gpt-6.1-sol` medium). Launch it with `agent_type` set to that profile and `fork_turns: "none"`; the profile pins the model, and the brief is the reviewer's whole input, with every path absolute when the work runs in another directory.
- Brief, these sections in this order:
  - `<user_messages>`: every message of the user in this conversation, verbatim and in order, each as `<message n="N">…</message>`; a summary of earlier context goes in as `<compaction_summary note="written by the main model when it compacted the context, not the user's words">…</compaction_summary>`.
  - `<agreement>`, only when there are any: accepted proposals and decisions that are not in the user's own messages, verbatim.
  - `<object>`: the paths of the object and its sources, the diff as a file path, since the reviewer only reads files, and the stage: pre-action or pre-completion.
  - `<criterion>`: what this check confirms.
  - `<rejected_earlier>`, from the second pass on: the findings rejected in earlier passes, each with its reason.
- The verdict comes as the reviewer's final:
  - `CLEAN`: the check passed; run no further pass for confidence.
  - `FINDINGS:`: your teammate's findings. Find each quote by searching for it. A finding whose two quotes stand verbatim in their sources is admitted: fix it exactly to its REQUIRED OUTCOME and no further; do not reject it, argue with it or put it to the user. Reject a finding only when a quote is not verbatim, or a NOT AGREED element is covered by a verbatim quote of the agreement, and give that reason with the quote. Fix all admitted findings in one batch, then launch a fresh reviewer with the same level, object and criterion and every rejection so far in `<rejected_earlier>`, until CLEAN.
  - `CLEAN` followed by `UNCHECKED:`: the check is incomplete. Resolve UNCHECKED sources or retry malformed output; never claim the check passed.
  - No verdict, an error or a reviewer that could not start: the check has not passed, and no self-check replaces it. Launch it again once on the unchanged object; if it fails again, tell the user and wait.
