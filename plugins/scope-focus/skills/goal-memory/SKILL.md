---
name: goal-memory
description: Explicitly add durable prompt-managed memory to an active native Goal. Use only when the user explicitly invokes `$goal-memory`.
---

# Goal Memory

Use this skill only for an explicit `$goal-memory` invocation.

## Workflow

1. Call `get_goal` first. Require an active native Goal.
2. From the stable `threadId` and `createdAt` fields returned by `get_goal`, create or reuse through available file tooling `scope-focus-goal-memory/<threadId>/<createdAt>` in the host runtime temporary directory. A new Goal in the same thread uses a different directory.
3. Allow only `state.md` and optional `cache/` in that directory. `state.md` records the exact `threadId`, `createdAt`, and objective. If any identity differs from the current `get_goal`, stop activation instead of reusing or mixing memory.
4. On every continuation, read `state.md` first and verify that identity against `get_goal`. Apply current user amendments before continuing; record material amendments, the current step, and affected grounds in the same `state.md`. Do not execute a superseded step. Reassess only facts and evidence invalidated by the amendment.

## Runtime rules

- Native Goal is the source of its identity, status, and original objective. The active order also follows applicable later user instructions and higher-priority rules; memory records progress and grants no authority. Do not create, reset, or redefine the native Goal through memory. The exact objective snapshot in state.md is for identity comparison, not a second governing goal.
- Update `state.md` only after meaningful progress with evidence, current step, next action, cache locators, and invalidation notes.
- Put only expensive reusable findings in `cache/`. Trust recorded evidence until it is missing, stale, contradicted, or invalidated by later work.
- Do not create `raw-goal.md`, `goal.md`, hashes, a launcher, daemon, roadmap, review, lifecycle, parser, mode, dependency, documentation, or eval harness.
- Do not delete memory automatically. Preserve it unless the user explicitly requests exact cleanup.

- If an amendment requires a change to the native Goal itself, use only an actually available authorized native path. Never mark the old Goal complete merely to replace it or substitute an objective through state.md. If no native path exists and user action is necessary, state the exact limitation and ask only the necessary question; continue any compatible independent work.
