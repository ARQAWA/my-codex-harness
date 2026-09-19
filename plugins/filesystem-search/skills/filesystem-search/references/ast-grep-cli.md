# ast-grep reference

Use the full `ast-grep` executable for one-shot, read-only syntax searches. Scope the path and name the language explicitly:

```text
ast-grep --pattern 'PATTERN' --lang python path/to/scope
ast-grep --pattern 'PATTERN' --lang javascript --json path/to/scope
```

Use JSON output when results will be consumed structurally. In the installed version, plain `--json` emits one JSON array, so consumers must parse an array. Discovery forbids `--rewrite`, interactive rewrite, and `-U`. ast-grep matches syntax; it does not establish types, data flow, or control flow. Route unsupported languages and ordinary text to tgrep.
