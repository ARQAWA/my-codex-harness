---
name: subagents
description: "Root Main only: review, code_writer, shell_runner, codebase_explorer and custom subagents, launched with native spawn_agent."
---

# Subagents

Launch every subagent with native `spawn_agent`, `agent_type` set to its profile name and `fork_turns: "none"`; the profile pins the model, and the brief is the subagent's whole input, since it does not see the conversation. A brief whose work runs in another directory gives every path in it as an absolute path. Launch independent subagents in one response. The call returns at once; the final arrives later as a message from that agent. Keep doing your own part of the task, but do not write your final answer while a subagent runs: when nothing else is left, call `wait_agent`, and its finals wake you. Never poll and never run filler commands such as pwd, ls or git status.

## review

Blind review by a separate model: it checks the work against the user's agreement and returns `CLEAN` or every finding with verbatim quotes. Keep working meanwhile; do not wait or poll.

- Level: light for small work, blind for large work, high when the user asks for it. The user's skills `$lightreview`, `$blindreview` and `$highreview` ask for these levels. The level picks the profile: light `spotty` (`gpt-6-sol` medium), blind `smarty` (`gpt-6.1-sol` low), high `bossy` (`gpt-6.1-sol` medium).
- Brief: the agreement, the user's request, amendments, answers and accepted proposals, verbatim; the object, the paths of the changed files, the diff or the command that shows it, and the stage; the criterion, what the check confirms; rejected, the findings you rejected earlier, with their reasons.
- Fix every admitted finding; reject one only with a reason backed by a verbatim quote. Each pass is a fresh reviewer.

## code_writer

Hand code writing to a fast model (`gpt-6-luna` at medium) that writes it exactly as the brief says and decides nothing. Keep working meanwhile: read, search, write other files. Do not wait or poll.

- Write the code yourself only when the brief would be about as long as the code: an edit of a few lines, a rename, a change you already see exactly. Whenever the brief is shorter than the code, use code_writer: a new module, new functions, new tests, or edits across several places. Launch several in one response for independent parts, such as the module and its tests.
- Decide the design first: the brief carries decisions, not questions. `goal`: what will be true. `files`: every target file and every file it must read; it reads them all in its first `exec`. `cwd`. `decisions`: exact names, signatures, values and formatting to keep. `facts`: what you found that it cannot see, such as what callers pass. `check`: one existing command to run after the edits.
- Trust the final and use it as it is; reread changed files only when acceptance needs it. `DECISION_REQUIRED` means the brief left a choice open: make it and launch again.
- Do not edit the same files yourself while its task runs.

## shell_runner

Hand running programs to a fast model (`gpt-6-luna` at medium) that runs exactly the commands given and reports what happened: tests, builds, scripts, installs, servers, and long or noisy runs whose output should not fill your context. Keep working meanwhile; do not wait or poll.

- Run a short command whose full output you need yourself.
- Brief: `cwd`; `commands`: each exact command in order, which ones are independent and may run in parallel, the timeout of each, and for a server its start command, ready log line or port and whether it stays running; `on_fail`: stop or continue; `report`: which output lines to quote verbatim.
- Trust the report and use it as it is.

## codebase_explorer

Hand an independent area of a broad codebase search to a read-only explorer on your model, with your reasoning level capped at medium: when your reasoning is above medium or unknown, pass `reasoning_effort: "medium"`, otherwise pass no override. It searches in its own context and returns only the findings. Launch every explorer at once, then wait for all of their finals.

For a broad question that spans several independent areas, such as separate subsystems, every caller of something across the codebase, or the deploy and run configuration, launch several explorers in one response, one per area; they run in parallel. Then continue yourself: check what the answer depends on most, search what the findings leave open, and write the answer.

Never use it:
- for a needle query (one class, function, string or config key), a known file, 2-3 files, or a quick question; search those yourself;
- for an area your own search already covers.

Brief: the exact area, the context it needs and exactly what to return; thoroughness: quick by default, medium when the area spans several naming conventions; very thorough only when the user asks for an exhaustive list.

Do not search an area again that an explorer already covered; trust its findings and use them as they are.

## custom

Run a subagent with no role on a model the user named. Use it only when the user directly asks for a subagent on a named model: `spawn_agent` without `agent_type`, with `model` as the user named it and `reasoning_effort` only when the user named a level. The message is the whole brief and ends with: «Work by the brief, then reply with your result as your last message.»
