---
name: subagents
description: "Root Main only: native agent launches and the three blind reviewer profiles."
---

# Subagents

## Reviewers

The harness supplies three reviewer profiles. Launch a reviewer with native `spawn_agent` and set `agent_type` to the profile name:

- `spotty`: blind reviewer for small work and gates that name it. Model: `gpt-6.1-sol` low.
- `smarty`: blind reviewer for large work. Model: `gpt-6.1-sol` medium.
- `bossy`: blind reviewer on the owner's explicit invocation, including an adopted standing audit procedure. Model: `gpt-6.1-sol` high.

Reviewers share one prompt and differ only in reasoning. Follow the applicable review cycle for manual and automatic invocation. Each blind pass gets a fresh reviewer with `fork_turns: "none"`; its brief is its whole input. Launch independent parts in one response, keep the reviewed object frozen, and close each finished reviewer with the next tool batch when a close tool exists.
