# Installation and update

Run this procedure only after an authorized Lunatron installation or update request.
Start in the root of the unpacked Lunatron folder; it is the authoritative source.
Keep
Tritron/Lunatron mutually exclusive and do not delete unrelated plugins, profiles,
archives, configuration, or data.

The package contains one synchronous `PostToolUse` hook. Its matcher is
`^(Bash|read_mcp_resource|mcp__.*)$`; `mcp__codex_app__*` is skipped. Large
results are stored under `PLUGIN_DATA/tool-results/<safe-session-id>` and Main's
requested files belong under `PLUGIN_DATA/artifacts/<safe-session-id>`. No new MCP
is required. Disabling, updating, or reinstalling the plugin does not clean either
of these data trees.

## macOS, Linux, and other POSIX shells

Run from the authoritative source:

```sh
PLUGIN_SOURCE="$(pwd -P)"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
PLUGIN_CREATOR="$(find "$CODEX_DIR/skills/.system/plugin-creator" -type f -name 'read_marketplace_name.py' -print -quit)"
[ -n "$PLUGIN_CREATOR" ] || { echo "plugin-creator not found" >&2; exit 1; }
PLUGIN_CREATOR_DIR="$(dirname "$PLUGIN_CREATOR")"
MARKETPLACE_NAME="$(python3 "$PLUGIN_CREATOR_DIR/read_marketplace_name.py")" || exit 1
[ "$MARKETPLACE_NAME" = "personal" ] || { echo "unexpected marketplace: $MARKETPLACE_NAME" >&2; exit 1; }
python3 "$PLUGIN_CREATOR_DIR/update_plugin_cachebuster.py" "$PLUGIN_SOURCE" || exit 1
codex plugin add "lunatron@$MARKETPLACE_NAME" || exit 1
VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$PLUGIN_SOURCE/.codex-plugin/plugin.json")"
INSTALLED_ROOT="$CODEX_DIR/plugins/cache/$MARKETPLACE_NAME/lunatron/$VERSION"
for REL in .codex-plugin/plugin.json hooks/hooks.json hooks/lunatron.cjs agents/lunatik.toml INSTALL.md; do
  cmp -s "$PLUGIN_SOURCE/$REL" "$INSTALLED_ROOT/$REL" || { echo "package mismatch: $REL" >&2; exit 1; }
done
mkdir -p "$CODEX_DIR/agents"
cp "$PLUGIN_SOURCE/agents/lunatik.toml" "$CODEX_DIR/agents/lunatik.toml"
cmp -s "$PLUGIN_SOURCE/agents/lunatik.toml" "$CODEX_DIR/agents/lunatik.toml" || { echo "profile mismatch" >&2; exit 1; }
```

Expected results: `read_marketplace_name.py` prints `personal`; the cachebuster
helper prints the old and new manifest versions; `codex plugin add` prints the
installed cache path. `VERSION` comes from the source manifest and
`INSTALLED_ROOT` resolves to `<CODEX_DIR>/plugins/cache/personal/lunatron/<VERSION>`.
Every `cmp` prints nothing and exits `0` for all five package files and the user
profile. The profile must show `name = "lunatik"`, `model = "gpt-5.6-luna"`, and
`model_reasoning_effort = "high"`.

Open a new interactive Codex task in the source directory and enter `/hooks`.
Review the listed Lunatron definitions. Trust the four current entries only:
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `PostToolUse`; after trust,
all four must be `Active` and show no `Review` count. Use the `/hooks` screen for
persistent trust. Do not substitute `--dangerously-bypass-hook-trust`, which only
bypasses persisted trust for one invocation.

Start a **new task** after trust. In that task, confirm from runtime evidence that
Lunatron active context is present for root `gpt-6-astra` or `gpt-5.6-sol` at any
effort, the `lunatik` profile is picked up, and the active context reports the
current `session_id` plus absolute `PLUGIN_DATA/tool-results/<safe-session-id>` and
`PLUGIN_DATA/artifacts/<safe-session-id>` paths. Verify that `PLUGIN_DATA` is
available. An already open task may retain old context and work; do not claim it
updated in place.

For an authorized macOS/Linux validation, use only the installed cache path and a
separate temporary `PLUGIN_DATA` directory. Execute each command exactly as shipped
with safe JSON payloads for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, and
`PostToolUse`; check exit status, stdout JSON protocol, and stderr. Confirm a small
PostToolUse result produces no output and no file. Confirm a synthetic
`tool_response` whose UTF-8 JSON is greater than 8192 bytes creates exactly one
package and returns `decision: "block"` with its absolute path. Confirm the same
large payload without `PLUGIN_DATA` returns only `systemMessage`, does not block,
and creates no package. Remove only the temporary validation directory after all
checks with `rm -r -- <exact-validation-directory>` and verify it is absent.


The following reproducible POSIX check uses only the installed cache path. Set
`INSTALLED_ROOT` to the path printed by `codex plugin add`:

```sh
set -eu
INSTALLED_ROOT="/Users/<user>/.codex/plugins/cache/personal/lunatron/<version>"
VALIDATION_DIR="$(mktemp -d /tmp/lunatron-validation.XXXXXX)"
export INSTALLED_ROOT VALIDATION_DIR
SESSION_OUTPUT="$(printf '%s' '{"hook_event_name":"SessionStart","model":"gpt-6-astra","session_id":"mac-check"}' | PLUGIN_ROOT="$INSTALLED_ROOT" PLUGIN_DATA="$VALIDATION_DIR" node -e "require(require('node:path').join(process.env.PLUGIN_ROOT,'hooks','lunatron.cjs')).sessionStart()")"
[ -n "$SESSION_OUTPUT" ]
PROMPT_OUTPUT="$(printf '%s' '{"hook_event_name":"UserPromptSubmit","model":"gpt-6-astra","session_id":"mac-check"}' | PLUGIN_ROOT="$INSTALLED_ROOT" PLUGIN_DATA="$VALIDATION_DIR" node -e "require(require('node:path').join(process.env.PLUGIN_ROOT,'hooks','lunatron.cjs')).userPromptSubmit()")"
[ -n "$PROMPT_OUTPUT" ]
PRE_OUTPUT="$(printf '%s' '{"hook_event_name":"PreToolUse","model":"gpt-6-astra","tool_name":"spawn_agent","tool_input":{"agent_type":"lunatik","fork_turns":"none","message":"stage","task_name":"stage1"}}' | PLUGIN_ROOT="$INSTALLED_ROOT" PLUGIN_DATA="$VALIDATION_DIR" node -e "require(require('node:path').join(process.env.PLUGIN_ROOT,'hooks','lunatron.cjs')).preToolUse()")"
[ -z "$PRE_OUTPUT" ]
SMALL_OUTPUT="$(printf '%s' '{"hook_event_name":"PostToolUse","model":"gpt-6-astra","tool_name":"Bash","session_id":"mac-check","tool_use_id":"small","tool_response":"small"}' | PLUGIN_ROOT="$INSTALLED_ROOT" PLUGIN_DATA="$VALIDATION_DIR" node -e "require(require('node:path').join(process.env.PLUGIN_ROOT,'hooks','lunatron.cjs')).postToolUse()")"
[ -z "$SMALL_OUTPUT" ]
[ "$(find "$VALIDATION_DIR" -type f | wc -l | tr -d ' ')" = 0 ]
LARGE_OUTPUT="$(python3 -c 'import json; print(json.dumps({"hook_event_name":"PostToolUse","model":"gpt-6-astra","tool_name":"Bash","session_id":"large-check","tool_use_id":"tu-1","tool_response":"x"*9000}))' | PLUGIN_ROOT="$INSTALLED_ROOT" PLUGIN_DATA="$VALIDATION_DIR" node -e "require(require('node:path').join(process.env.PLUGIN_ROOT,'hooks','lunatron.cjs')).postToolUse()")"
printf '%s\n' "$LARGE_OUTPUT" | rg '"decision":"block"'
[ "$(find "$VALIDATION_DIR" -type f | wc -l | tr -d ' ')" = 1 ]
FAIL_OUTPUT="$(python3 -c 'import json; print(json.dumps({"hook_event_name":"PostToolUse","model":"gpt-6-astra","tool_name":"Bash","session_id":"fail-check","tool_use_id":"tu-2","tool_response":"x"*9000}))' | env -u PLUGIN_DATA PLUGIN_ROOT="$INSTALLED_ROOT" node -e "require(require('node:path').join(process.env.PLUGIN_ROOT,'hooks','lunatron.cjs')).postToolUse()")"
printf '%s\n' "$FAIL_OUTPUT" | rg 'systemMessage'
rm -r -- "$VALIDATION_DIR"
[ ! -e "$VALIDATION_DIR" ]
```

All four commands must exit `0`; stdout and stderr must match the expected hook
protocol. The small call emits nothing, the large call saves one package and blocks,
and the fail-open call emits only `systemMessage` without blocking or adding a file.

## Windows Git Bash

From the authoritative source in Git Bash:

```bash
PLUGIN_SOURCE="$(pwd -P)"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
PLUGIN_CREATOR="$(find "$CODEX_DIR/skills/.system/plugin-creator" -type f -name 'read_marketplace_name.py' -print -quit)"
[ -n "$PLUGIN_CREATOR" ] || { echo "plugin-creator not found" >&2; exit 1; }
PLUGIN_CREATOR_DIR="$(dirname "$PLUGIN_CREATOR")"
MARKETPLACE_NAME="$(python3 "$PLUGIN_CREATOR_DIR/read_marketplace_name.py")" || exit 1
[ "$MARKETPLACE_NAME" = "personal" ] || { echo "unexpected marketplace: $MARKETPLACE_NAME" >&2; exit 1; }
python3 "$PLUGIN_CREATOR_DIR/update_plugin_cachebuster.py" "$PLUGIN_SOURCE" || exit 1
codex plugin add "lunatron@$MARKETPLACE_NAME" || exit 1
VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$PLUGIN_SOURCE/.codex-plugin/plugin.json")"
INSTALLED_ROOT="$CODEX_DIR/plugins/cache/$MARKETPLACE_NAME/lunatron/$VERSION"
for REL in .codex-plugin/plugin.json hooks/hooks.json hooks/lunatron.cjs agents/lunatik.toml INSTALL.md; do
  cmp -s "$PLUGIN_SOURCE/$REL" "$INSTALLED_ROOT/$REL" || { echo "package mismatch: $REL" >&2; exit 1; }
done
mkdir -p "$CODEX_DIR/agents"
cp "$PLUGIN_SOURCE/agents/lunatik.toml" "$CODEX_DIR/agents/lunatik.toml"
cmp -s "$PLUGIN_SOURCE/agents/lunatik.toml" "$CODEX_DIR/agents/lunatik.toml" || exit 1
```

Expected results and `/hooks` trust steps are the same as POSIX. Use the actual
configured hook shell and installed `PLUGIN_ROOT`. After installation, profile,
and trust, execute every actual `command` string from the installed
`hooks/hooks.json` in that shell. Supply valid payloads for all four events and
check command exit status, stdout, and stderr. Exercise Windows paths containing
spaces and non-ASCII characters, verify `PLUGIN_ROOT` and `PLUGIN_DATA`, and check
small passthrough, large `>8192` save plus `decision: "block"`, and fail-open
without `PLUGIN_DATA`. A static read or macOS run is not Windows evidence.

## Windows PowerShell

Run from the authoritative source:

```powershell
$PluginSource = (Get-Location).Path
$CodexDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$CreatorRoot = Join-Path $CodexDir 'skills\.system\plugin-creator'
$MarketplaceScript = Get-ChildItem -Path $CreatorRoot -Filter read_marketplace_name.py -File -Recurse | Select-Object -First 1
if (-not $MarketplaceScript) { throw 'plugin-creator not found' }
$CreatorDir = $MarketplaceScript.DirectoryName
$MarketplaceName = (python $MarketplaceScript.FullName).Trim()
if ($MarketplaceName -ne 'personal') { throw "unexpected marketplace: $MarketplaceName" }
python (Join-Path $CreatorDir 'update_plugin_cachebuster.py') $PluginSource
if ($LASTEXITCODE -ne 0) { throw 'cachebuster update failed' }
codex plugin add "lunatron@$MarketplaceName"
if ($LASTEXITCODE -ne 0) { throw 'plugin install failed' }
$Version = (Get-Content (Join-Path $PluginSource '.codex-plugin\plugin.json') -Raw | ConvertFrom-Json).version
$InstalledRoot = Join-Path (Join-Path (Join-Path (Join-Path $CodexDir 'plugins') 'cache') $MarketplaceName) (Join-Path 'lunatron' $Version)
foreach ($Relative in @('.codex-plugin\plugin.json','hooks\hooks.json','hooks\lunatron.cjs','agents\lunatik.toml','INSTALL.md')) {
  $SourceHash = (Get-FileHash (Join-Path $PluginSource $Relative)).Hash
  $InstalledHash = (Get-FileHash (Join-Path $InstalledRoot $Relative)).Hash
  if ($SourceHash -ne $InstalledHash) { throw "package mismatch: $Relative" }
}
$AgentsDir = Join-Path $CodexDir 'agents'
New-Item -ItemType Directory -Force -Path $AgentsDir | Out-Null
Copy-Item (Join-Path $PluginSource 'agents\lunatik.toml') (Join-Path $AgentsDir 'lunatik.toml') -Force
if ((Get-FileHash (Join-Path $PluginSource 'agents\lunatik.toml')).Hash -ne (Get-FileHash (Join-Path $AgentsDir 'lunatik.toml')).Hash) { throw 'profile mismatch' }
```

`codex plugin add` must print the installed cache path. `$Version` comes from the
source manifest and `$InstalledRoot` is the corresponding
`<CODEX_DIR>/plugins/cache/<marketplace>/lunatron/<version>` directory. The five
`Get-FileHash` comparisons and the user-profile comparison must all match; the
profile must use `gpt-5.6-luna` and `high`. In a new interactive task, use `/hooks` to review and
trust exactly the four Lunatron definitions. Then run every installed hook command
in the real configured shell, with valid payloads for all four events. Check exit,
stdout protocol, stderr, path quoting, spaces/non-ASCII paths, `PLUGIN_ROOT`, and
`PLUGIN_DATA`. Cover small passthrough, large `>8192` save plus block, and fail-open
without `PLUGIN_DATA`. Do not use `--dangerously-bypass-hook-trust` as a substitute
for persistent trust.

When Lunatron is disabled, a new task does not load its hooks. The `lunatik` profile
starts nothing by itself. An open task can retain old context or running work.
Disable/update/reinstall never removes `PLUGIN_DATA/tool-results` or
`PLUGIN_DATA/artifacts`; remove only exact temporary files or directories when an
authorized validation procedure requires it.
