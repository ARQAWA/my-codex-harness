# tgrep CLI

Use one disjoint form with a mandatory `--` and at least one existing relative scope:

```text
node "<skill-root>/scripts/tgrep-search.cjs" "<absolute-root>" [options] -- <pattern> <scope>...
node "<skill-root>/scripts/tgrep-search.cjs" "<absolute-root>" -e <pattern> [more -e/-f options] -- <scope>...
node "<skill-root>/scripts/tgrep-search.cjs" "<absolute-root>" --files [options] -- <scope>...
```

`-e/-f` expressions and `--files` cannot be combined. Known exact files may be read directly. File scopes, `-f`, explicit `--no-ignore`, and incompatible modes use rg; directory scopes use the index. The wrapper passes `--no-require-git` to index, serve, and indexed content searches so tgrep honors `.gitignore` even when the project is not a Git repository. It omits that flag for `--files`, allowing the server's already configured filename index to serve paths without a filesystem walk. It passes `--exclude .git` to both corpus-building commands. The index uses tgrep's normal ignore rules, including `.ignore`; the wrapper never enables `--no-ignore` while building it. Hidden paths are excluded unless the query explicitly uses `--hidden`; that option preserves ignore rules and the `.git` exclusion, as do positive `--glob/--iglob` filters. Native file-type and size limits remain.

Compatibility routes: `--no-index`, explicit `--no-ignore`, non-auto encoding/no-encoding, unrestricted and granular no-ignore options, binary/text, one-file-system, custom ignore-file, explicit size limits, files-mode ignore-file-case-insensitive, zip search, and pattern files. `--follow` is rejected. Input files cannot escape root. rg receives `--no-config` and defaults to `--engine auto`; explicit query options are preserved. Final size policy and multiline-dotall semantics are preserved. Native output and exit status are final; do not run a second rg.

The wrapper owns `<active-codex-home>/tgrep/index/<hash>/` and always supplies `--index-path`. Native `serve.lock` prevents duplicate servers; it is never removed. A built-in SQLite lifecycle lock serializes concurrent wrapper starts and corpus migration. On corpus-policy change, the wrapper confirms the old server via native status, serve metadata, and index root, terminates that exact PID, performs one native corpus rebuild using default ignore behavior and the `.git` exclusion, then starts `serve` with the same settings. A marker records the corpus policy, root, and PID; subsequent calls reuse the daemon and index.

First readiness requires complete indexing under normal ignore rules and an active native/auto watcher or polling mode. Index construction has no one-second cutoff; status calls are individually bounded. Native errors or daemon exit give `75` with `TGREP_BACKEND_UNAVAILABLE`. Ordinary empty results keep native exit `1`. Only `75` permits an agent's narrow rg fallback; try the wrapper again for the next ordinary query. Exceptional native fallbacks are not an absolute index-only guarantee.
