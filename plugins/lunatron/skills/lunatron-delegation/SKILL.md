---
name: lunatron-delegation
description: Explicitly authorizes Lunatron root-task delegation when the Lunatron hook reports LUNATRON_STATE=ACTIVE and directs Main to load this skill.
---

# Lunatron delegation

When this skill is loaded because the Lunatron hook directed Main to read it,
and the hook reports `LUNATRON_STATE=ACTIVE` for the root task, delegate work
blocks according to the active Lunatron hook contract without asking the user
for a separate request. Follow the hook's roles, boundaries, and workflow, as
well as all higher-priority instructions.

This root instruction applies only to an active root task. When the root hook
reports `LUNATRON_STATE=INACTIVE`, this skill does not authorize root delegation.
A child follows its assigned role without inheriting root orchestration. Child
INACTIVE does not cancel a configured Sol profile's narrow right to assign its
own bounded Luna implementation blocks with full available conversation context,
a sufficient descriptive plan, and pinned Luna roles. It does not grant that
right to other inactive roles or authorize Sol-to-Sol chains. Luna final returns
to its immediate Sol; Sol completes the block and returns to Main. All agents
trust completed results without handoff-driven rereads, research, checks or
review. Only explicitly assigned reviewers perform requested review. Scope,
authority, native wait, actual shared budget, and immediate-parent native closure
follow the configured role and active contract; final is not proof of closure.
Only root Main applies goal and manages the native Goal.

Each final returns the comprehensive finished knowledge of the entire assigned
block, including established facts, conclusions, decisions and grounds, exact
references, applicability, authorized check results, errors, unknowns and
remaining owner decisions. A huge report is appropriate when needed; neither
brevity nor an excerpts packet limits that knowledge. No report file, fixed size
or noisy work-history dump is required. The immediate owner directly uses this
result without gathering or deriving finished facts again; only a concrete
material gap or reported problem needs clarification.
