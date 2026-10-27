---
name: define-goal
description: "Agree on one goal with the user, set it with create_goal, carry it out and finish only after every check passes. Started by the user with $define-goal."
---

# Define goal

The user started `$define-goal`. The text after it is the rough objective: a description of the task, not yet an order to act. If there is none, ask what they want to achieve. Agree on one goal with the user, set it with `create_goal`, carry it out, and finish only after every check of its success criteria passes. A goal runs across many turns and outlives context compaction, and Codex repeats its objective in every goal turn, so the objective alone must carry everything the work and its checks need, including the user's own words.

Write every message by the message rules. The user never sees the objective and does not keep earlier messages in mind, so name every item, quote, criterion, option and file by what it says, never by a code or a bare number.

## 1. Explore first

Before the first question, read the code, configuration and documents the rough objective touches, read-only and only as far as the questions need. Ask nothing the files answer.

## 2. Interview

Ask in the chat, one question per message in the question format, then end the turn and wait; keep the other open questions for later messages. Ask only what changes the result and what the files cannot settle: the end state, how to prove it, what must not change, the limits of the run, and hard parts the user may not have weighed. Each question gives two to four concrete options from the project, the recommended one marked, each with its consequence. Stop once the objective can be written. If the user declines, set no goal.

## 3. Draft the objective

Write it in English, keeping the user's quotes verbatim in his language, with these sections in order:

- `## Objective`: one or two sentences naming the single measurable end state.
- `## Quotes`: numbered verbatim quotes, `Q1. «…» (source)`: every requirement, value, constraint or prohibition from the rough objective, the user's messages and answers, copied character for character. When a quote makes sense only with its question, such as a picked option or a «да», name that question as the source.
- `## Success criteria`: `S1. <one result>. Check: <command, or file to read> → <expected signal>. Quotes: Q2, Q4.` Each criterion is binary; reject «works well» or «clean». Use the project's existing checks; when no command proves a criterion, reading the named file is its check.
- `## Boundaries`: what may change and what must stay unchanged, each line with its quotes.
- `## Stop conditions`: when to stop and ask: ambiguity the agreement does not settle, a risky or irreversible operation, or a cap the user gave. Do not invent a cap.
- `## Completion`: "Before marking the goal complete, obtain each Check result once and confirm that every success criterion holds by its check and every boundary holds. Fix what fails and repeat only the affected checks. Complete the goal only when every check passes."

Keep required outcomes distinct from implementation choices. A necessary constraint the user did not state carries `Quotes: proposed` and binds only after the user accepts it.

## 4. Confirm

Check the objective against the user's words: nothing agreed is lost or distorted, nothing unsaid is added except `Quotes: proposed` items. Never show the objective. Write a short retelling in the user's language: one bold sentence with the main point, short numbered items with the exact values, then «Границы», «Остановка» and «Проверка», a line or two each. Mark every proposed item as your proposal with its reason.

When the retelling holds no proposal, divergence or decision of yours the user must confirm, set the goal at once by step 5. Otherwise ask about each such place in the question format, one question per message; an unanswered question is not approval. Once every required decision has its own answer, end the retelling with one line that says what starts and asks for the go, such as «Начинаем цель: интерфейс в стиле Cursor? Ответь «го» или напиши, что поправить.» Then wait. «го», «да» or «начинаем» accepts the whole goal with the decisions already answered. A correction changes the objective and adds his words to Quotes; show the new retelling and ask again only about what changed.

## 5. Set and work

Call `create_goal` with the fixed objective verbatim, and `token_budget` only when the user gave one. Confirm in one sentence and start. Claim success only from evidence. When a stop condition fires, report it and wait with the goal left open.

## 6. Finish

Follow the objective's Completion section, then complete the goal and report briefly what is now true and whether every check passed. If a check cannot run, leave the goal open, tell the user and wait.
