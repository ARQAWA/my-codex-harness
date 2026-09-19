# tgrep reference

`tgrep` maintains a per-repository trigram index. The filesystem-search wrapper owns the fixed `<root>/.tgrep` path and invokes supported `--index-path` syntax for status, serve, search, and files mode. It starts at most one official detached `tgrep serve`; the official `serve.lock` owns singleton behavior.

Use the wrapper with one of its three disjoint forms:

```text
node "<skill-root>/scripts/tgrep-search.cjs" "<absolute-root>" [options] -- <pattern> <explicit-scope>...
node "<skill-root>/scripts/tgrep-search.cjs" "<absolute-root>" [one or more -e/--regexp or -f/--file] -- <explicit-scope>...
node "<skill-root>/scripts/tgrep-search.cjs" "<absolute-root>" --files [file-options] -- <explicit-scope>...
```

`--` is mandatory. Scopes are existing root-relative paths; `.` is reserved for an intentional repository-wide query. Tokens after `--` are never parsed as flags or lifecycle words. The expression form accepts `-e/--regexp` or `-f/--file`, with only scopes after `--`; `-f/--file` always routes to rg because its file-pattern semantics are not indexed. `--files` cannot combine with either option. Invalid grammar/root/scope exits `2`.

Ordinary indexed content is `tgrep search --index-path "<root>/.tgrep" ... -- <pattern> <scope>...`; files mode is `tgrep --index-path "<root>/.tgrep" --files ... -- <scope>...`. The wrapper never adds `--no-index` and does not claim the backend is absolutely index-only.

The wrapper routes incompatible requests to `rg` before lifecycle for `--no-index`, `--hidden`, `--no-encoding`, `--no-require-git`, unrestricted/no-ignore options except `--no-ignore-messages`, `--text`/`--binary`, non-auto `--encoding`, positive `--glob`/`--iglob`, `-L`/`--follow`, `--one-file-system`, custom `--ignore-file`, explicit size-limit options, files-mode `--ignore-file-case-insensitive`, `-z`/`--search-zip`, and every `-f`. The wrapper executes this rg route internally and its result is final; do not run another rg. Only wrapper exit `75` permits one narrow agent fallback. Native `0/1/2` results are final. It preserves native rg output and exit status, always adds `--no-config`, defaults to `--engine auto`, absorbs `--no-index`, applies the final left-to-right size policy, and expands tgrep `--multiline-dotall` to both `--multiline --multiline-dotall`. Backend readiness failure exits `75` with `TGREP_BACKEND_UNAVAILABLE:`; retry the wrapper on the next ordinary query.
