# ast-grep reference

Use AST as a scoped syntax fallback when indexed answers are insufficient, or for strict-current syntax. All AST search goes through the wrapper; direct `ast-grep`/`sg` invocation is denied by the guard hook. The wrapper accepts only the current Codex session working directory supplied by the hook as root (home, Codex home, and the filesystem root exit `2`), and every scope is an existing root-relative path:

```text
node "<skill-root>/scripts/ast-grep-search.cjs" "<absolute-root>" --pattern 'PATTERN' --lang python -- <scope>...
node "<skill-root>/scripts/ast-grep-search.cjs" "<absolute-root>" --pattern 'PATTERN' --lang javascript --json -- <scope>...
```

`--pattern` and `--lang` are required; `--json` (optionally `--json=<style>`) is the only other accepted option. Invalid grammar, root, or scope exits `2`. ast-grep is stateless: it builds no index, cache, or daemon. Use JSON output when results will be consumed structurally; plain `--json` emits one JSON array, so consumers must parse an array. Rewrite, interactive rewrite, `-U`, `--stdin`, `--config`, and project/rule modes (`scan`, `new`, `lsp`, `test`) are rejected. ast-grep matches syntax; it does not establish types, data flow, or control flow. Route unsupported languages and ordinary text to tgrep.
