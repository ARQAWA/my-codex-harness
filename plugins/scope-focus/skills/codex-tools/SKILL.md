---
name: codex-tools
description: "Codex tool mechanics: exec output limits, code-mode scripts, the context budget, and the reader CLI."
---

# Codex tool mechanics

- Code mode cuts every `exec` result to 10,000 estimated tokens: 40,000 bytes, which is about 40,000 characters of code or English text and about 22,000 of Cyrillic. The cut removes the middle and keeps the head and tail. Only the first-line pragma of the `exec` raises this limit; `max_output_tokens` on nested calls does not.
- Begin every `exec` that reads files or searches with `// @exec: {"max_output_tokens": N}`, where N covers everything the script emits (100000 when unsure), and give each nested `exec_command` the same `max_output_tokens`. Control volume by choosing what to read. Keep default limits for builds, tests, and logs, and filter their output.
- The context window holds about 258,000 tokens, about 40,000 of them taken at task start. Code takes about two-thirds of the reader's estimate of one token per four bytes. When the paths the task needs plus the deliverable stay under about 180,000 real tokens, read everything yourself and write once.
- Read files with the reader CLI whose path the hook supplies. `--sizes` lists directory totals in tokens, and `--files` lists files instead. A plain call prints whole files up to `--budget` tokens (default 90,000, at most 200,000; raise the pragma with it) and ends with the exact `--from` argument for the next part, so nothing is cut silently. `--skip-tests` leaves out test files and Rust test modules, `--lines A-B` prints a window of one file, and `-n` numbers lines.
- In one `exec`, start independent tool calls together and await them with `Promise.all`; await one call before starting another only when it needs that result. Reduce results in JavaScript and emit only what the next decision needs, such as `text(r.output)`.
- A result that shows `tokens truncated` has lost its middle. Request only the missing part with a larger limit before relying on it.
- One completed `wait_agent` can deliver several answers. Count the answers, and stop waiting once every spawned agent has answered.
- Put long text for `exec` JavaScript, such as a document or patch, in a `String.raw` template with a backslash before each backtick and `${`, then strip them with `` .replaceAll("\\`", "`").replaceAll("\\${", "${") ``; one unescaped backtick fails the script and loses the text. Append a long document in parts of a few thousand tokens.
