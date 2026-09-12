---
name: goal
description: Help the user define a concrete, measurable goal before starting work, especially when they ask to use the goal tool, create a goal, set an objective, clarify success criteria, or turn a fuzzy intention into a quantitative outcome. Use this skill for goal creation and goal refinement only; it does not manage durable snapshots, decision logs, or long-running execution artifacts.
---

# Define Goal

## Overview

Shape the user's intent into a concrete outcome with bounded scope and grounds for completion drawn from the request. Ordinary verification uses reading and logical assessment under the main prompt's rule; use numbers only when they express a real requirement.

This skill covers goal definition and goal-tool creation only. Do not create intermediate planning artifacts, durable snapshots, ledgers, decision logs, or resume files from this skill.

## Workflow

1. Confirm that goal definition is actually needed.
   - Use this skill when the user asks for `$define-goal`, asks to create or set a goal, asks for the goal tool, or wants help turning an intention into a clear objective.
   - If the user only asks for ordinary implementation work, do the work directly instead of forcing goal creation.

2. Restate the likely goal in concrete terms.
   A usable goal names:
   - the specific outcome that will be true
   - the main artifact, system, repo, environment, or user-facing behavior involved
   - how the actual result will be established by reading and logical assessment, plus any explicitly required evidence
   - what is in scope
   - what is out of scope when ambiguity would matter
   - the stop condition for asking the user instead of grinding

3. Use criteria that represent the requested result.
   - Derive outcome, artifact paths, scope, format, values, and binary completion conditions from the request.
   - Do not invent metrics, thresholds, validators, or run counts for formal measurability.
   - Tests, commands, CI, measurements, and evidence counts are options only for explicitly requested empirical evidence or a specifically adopted procedure or higher-priority obligation.
   - For ordinary fixes, analysis, or architecture-based performance work, define completion through the actual result and logical assessment.

4. Repair weak goals before setting them.
   - Rewrite vague goals into concrete outcome criteria when the request and local context make that interpretation safe.
   - Ask one concise clarification question when the missing detail changes the intended outcome or validation.
   - Reject pure activity goals such as "make progress," "keep investigating," "improve things," or "work on X" unless they are sharpened into a verifiable outcome.

5. Check active goal state before creating a goal.
   - Call `get_goal`.
   - If there is no active goal and the objective meets the quality bar, call `create_goal`.
   - If there is an active goal that still matches the user's intent, continue using it instead of creating a duplicate.
   - If there is an active goal that conflicts with the new request, ask whether to finish the current goal, mark it complete if done, or start a separate goal-backed thread.

6. Create the goal only after it passes the quality bar.
   - Use a single concise objective string.
   - Include sufficient grounds for completion: the requested result assessed through reading and logic, plus any explicitly mandatory evidence. Every added threshold or method must follow the request; writing it into the objective creates no authority.
   - Include scope bounds when they constrain the work.
   - Include a token budget only when the user explicitly requested one.
   - Do not call `create_goal` for an ordinary multi-step task unless the user explicitly asked for goal-backed work.

## Goal Quality Bar

Before `create_goal`, the objective should answer:

- What concrete thing will be true when this is done?
- What actual material and logical grounds establish it, and what empirical evidence did the user explicitly require?
- What requested outcome or meaningful binary or quantitative condition defines success?
- What scope boundaries matter?
- What should cause the agent to stop and ask?

Good:

> Replace A with B in the specified setting. Finish when the edit is present and reading the affected code establishes consistency with the request.

Good:

> Resolve the specified design question from relevant sources and logic. Finish when the conclusion is supported and material contradictions are addressed.

Weak:

> Make checkout faster.

Weak:

> Keep investigating the PR comments.

## Quantification Heuristics

- For bugs, define the required correction and explain it through the affected code and logic. Reproduction and a failing-then-passing validator require an explicit request for that evidence.
- For explicitly requested tests, name the ordered scenario and its pass condition; honor a specified command.
- For performance, reason from mechanisms, work, and context. Label calculated complexity as calculation; claim a measured improvement only from actual measurements. Do not invent a metric, target, method, or run count.
- For quality work, use the requested outcome, ordinarily assessed through reading and logic; do not add lint, type checks, or tests automatically.
- For research, define the decision the research must enable, the sources or systems in scope, and the evidence standard.
- For operations, define the requested resulting state. Do not invent monitoring windows, thresholds, or rollback work.

## Clarifying Questions

Ask only when a reasonable rewrite would risk pursuing the wrong outcome. Keep the question short and oriented around the missing validator or scope boundary.

Useful question shapes:

- "What metric should define success here: latency, cost, accuracy, or user-visible behavior?"
- "Which environment should I verify against: local, staging, or production?"
- "What is the minimum evidence you want before I mark this goal complete?"

When a meaningful criterion follows directly from the request, formulate it without another confirmation. Ask only when an unresolved choice materially changes the outcome or mandatory evidence.
