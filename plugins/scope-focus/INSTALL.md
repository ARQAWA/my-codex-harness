# Installation and update

Read this file completely before an authorized install or update. Confirm with
`codex plugin list` that the marketplace source points at this repository. The
marketplace helper reads `MARKETPLACE_NAME`; if the source is not registered,
use the current Plugin Creator registration flow first. Bump the manifest once with
the existing cachebuster (skip when already bumped), then run
`codex plugin add "scope-focus@personal"`.

From the authoritative source in a POSIX shell, the native flow is:

```sh
PLUGIN_SOURCE="$(pwd -P)"
PLUGIN_CREATOR="$(find "$HOME/.codex/skills/.system/plugin-creator" -type f -name 'read_marketplace_name.py' -print -quit)"
[ -n "$PLUGIN_CREATOR" ] || { echo "plugin-creator not found" >&2; exit 1; }
PLUGIN_CREATOR_DIR="$(dirname "$PLUGIN_CREATOR")"
MARKETPLACE_NAME="$(python3 "$PLUGIN_CREATOR_DIR/read_marketplace_name.py")" || exit 1
python3 "$PLUGIN_CREATOR_DIR/update_plugin_cachebuster.py" "$PLUGIN_SOURCE" || exit 1
codex plugin add "scope-focus@$MARKETPLACE_NAME" || exit 1
mkdir -p "$HOME/.codex/agents"
cp "$PLUGIN_SOURCE/agents/properliler.toml" "$HOME/.codex/agents/properliler.toml" || exit 1
```

Every install or update must finish the native package update and copy the
packaged `properliler.toml` to `~/.codex/agents/properliler.toml`. Preserve all
unrelated profiles, settings, data, and hook trust. Remove the legacy
`foculizer` profile only when that old migration condition is detected.

## Clean install

After native installation and profile copy, inspect the installed hook
definitions and use the supported host flow to trust only the current entries.
Do not construct hashes or bypass trust. Always ensure the Sol reminder is
trusted and `enabled = false` on every clean install
unless the user expressly enabled it; preserve unrelated
trust. On Windows, execute every installed hook command in the actual Codex
hook shell, using Git Bash where configured, and check its protocol and paths.
Run activation and runtime probes only for this clean-install path.

## Windows hook verification (clean install)

On Windows, a clean installation is incomplete until every command entry in
the installed package's `hooks/hooks.json` has executed successfully in the
actual Codex hook environment. Perform this after native installation,
packaged-profile installation, and current hook-trust verification.

Use the actual configured hook shell (including Git Bash where configured), the
installed `PLUGIN_ROOT`, and an appropriate event payload on stdin for each
declared hook event and command. Check the exact command as shipped, not only
the referenced script. Exercise a path that actually loads and runs the
script; an inactive guard or skipped hook alone does not prove execution.

Verify required tooling is available on PATH, environment variables expand
correctly, and executable/script/data paths resolve with actual Windows drive,
separators, quoting, spaces, and non-ASCII characters when present. Check
command exit status, stdout protocol and expected event result, and stderr for
unexplained shell, path, module, or tooling errors. Distinguish an intentional
policy-denial response from an execution failure. Use non-destructive probes.

Static inspection or successful macOS/Linux execution is not Windows runtime
evidence. If a command cannot be executed or a check fails, do not declare the
Windows installation complete; report the exact command, environment, error,
and unresolved check. Preserve the macOS/Linux installation flow.

## Existing update

Update the native package and copy `agents/properliler.toml` every time. Read
the changed installed files and normal install output. Reconcile hook trust only
when definitions changed or the host requests it; preserve unrelated records.
Do not run clean-install activation probes, Windows full hook checks, or a
repository-wide comparison sweep during an ordinary update. A new task may be
needed to discover changed skills; this is not hot reload.

Native CLI or UI registration alone does not execute Markdown. An agent install
starts by reading `skills/setup-scope-focus/SKILL.md` and this `INSTALL.md`.
Trust bypasses are forbidden. Windows commands use Git Bash and portable
quoting; static inspection or a POSIX run is not Windows evidence.
