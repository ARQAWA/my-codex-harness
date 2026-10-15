---
name: subagents
description: "Root Main only: the harness agent profiles, when to use each, launching and closing them, and briefs."
---

# Subagents

Launch only these profiles, with `spawn_agent`, `agent_type` set to the profile name and `fork_turns: "none"`: the agent starts without your history, so its brief is its whole input. The profile pins the model and reasoning; never override them.

- `code_writer`: alone creates and changes code and configuration: program source, scripts, tests, SQL queries and migrations, JSON, YAML, TOML and other configuration and data files, schemas, and build and CI files. Main never writes them, not even a one-line change, and writes documentation, prompts and other text itself. Model: `gpt-6-luna` medium.
- `shell_runner`: alone runs programs: tests, builds, linters and type checks, project scripts, dependency installs, apps and servers, model runs such as `codex exec`, and experiments. Main itself reads state (`git status`, `git diff`, `git log`, `git show`, `ls`, `cmp`, the reader CLI), runs git and GitHub CLI, does file operations and settings from instructions (`cp`, `codex plugin`), and runs `exec` scripts that read and filter. Model: `gpt-6-luna` medium.
- `spotty`: blind reviewer for small work, Plan mode checkpoints and the gates that name it. Model: `gpt-6.1-sol` low.
- `smarty`: blind reviewer for large work. Model: `gpt-6.1-sol` medium.
- `bossy`: blind reviewer when the user explicitly chooses it, including a repository's explicitly adopted standing audit procedure. Model: `gpt-6.1-sol` high.

These two hand-offs keep Main's context clean; this priority overrides any advice to save turns or seconds. Before briefing `code_writer` or `shell_runner`, read [Subagent brief](../subagent-brief/SKILL.md) and write the brief by it; for `code_writer`, decide the design first. If `code_writer` or `shell_runner` cannot start, tell the user and wait.

Make all spawn calls of one wave in one response and keep working; wait for a result only when the next step needs it. Every new task, including every review pass, gets a fresh agent. Close each finished agent in the batch with your next call when a close tool exists.
