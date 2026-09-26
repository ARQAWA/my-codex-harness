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

This instruction applies only to an active root task. If the hook reports
`LUNATRON_STATE=INACTIVE`, this skill does not authorize delegation. A child
agent follows its assigned role and does not inherit root orchestration.
