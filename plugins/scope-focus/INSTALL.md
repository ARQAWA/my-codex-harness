# Installation

Native plugin installation, agent-profile installation, and hook-trust handling are separate required actions. Installation and every reinstall are incomplete until all of these finish:

1. Use the native plugin flow for Scope Focus. Do not treat it as installation of an agent profile.
2. Remove the legacy `foculizer` user-level agent profile, preserve unrelated profiles, install this package's `agents/properliler.toml` in the current user-level Codex agents directory, and verify the installed profile exactly matches the packaged profile.
3. After an authorized installation, reinstall, or hook-changing update, use the existing Codex CLI app-server STDIO interface to inspect Scope Focus's exact hook trust, correct it only as needed within the granted authority, and verify the resulting state. Do not reuse stale trust for a changed hook; preserve unrelated hook trust and never bypass host approval requirements.

Installation is incomplete until the native plugin, packaged `properliler` profile, and exact fresh hook trust are all ready; perform runtime checks only afterward.
## Windows hook verification

On Windows, installation or reinstallation is incomplete until every command entry in the installed package's `hooks/hooks.json` has been executed successfully in the actual Codex hook environment. Perform this after native installation, packaged-profile installation, and current hook-trust verification.

Use the actual configured hook shell (including Git Bash where configured), the installed `PLUGIN_ROOT`, and an appropriate event payload on stdin for each declared hook event and command. Check the exact command as shipped, not only the referenced script. Exercise a path that actually loads and runs the script; an inactive guard or skipped hook alone does not prove execution.

Verify required tooling is available on PATH, environment variables expand correctly, and executable/script/data paths resolve with the actual Windows drive, separators, quoting, spaces, and non-ASCII characters when present. Check command exit status, stdout protocol and expected event result, and stderr for unexplained shell, path, module, or tooling errors. Distinguish an intentional policy-denial response from an execution failure. Use non-destructive probe payloads, not changes to real user resources.

Static inspection or successful macOS/Linux execution is not Windows runtime evidence. If a command cannot be executed or a check fails, do not declare the Windows installation complete: report the exact command, environment, observed error, and the unresolved check. Preserve the existing macOS/Linux installation flow.
