---
name: setup-context-management
description: Install, configure, or update the Context Management plugin in Codex, including installation with Plugin Creator and config.toml setup. Read the bundled install.md before changing runtime files or configuration. Do not use for ordinary memory reads or writes.
---

# Set up Context Management

Before installation or configuration, read [install.md](../../install.md)
completely. Resolve the link relative to this `SKILL.md`, not the working
directory. Use that file as the installation procedure and path/config source;
do not reconstruct its commands from memory.

For a user-authorized installation, follow the applicable clean-install or
existing-update sequence in install.md, preserving current settings, data, and
unrelated MCP/configuration. Check the required harness capabilities first on
clean install; on update assess changed dependencies by reading them and report
a concrete incompatibility instead of claiming setup succeeded.
Registration with `codex plugin add` alone is not runtime activation. For clean
install, finish after the documented activation result is obtained. For an
ordinary update, read the changed files and normal install output; do not run
activation probes unless requested. For explanation-only requests, explain the
procedure without changing files.
