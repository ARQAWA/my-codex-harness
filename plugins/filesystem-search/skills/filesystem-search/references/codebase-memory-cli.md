# Codebase Memory CLI reference

Use only the installed `codebase-memory-mcp cli` one-shot commands. In this installed CLI-only configuration the project does not run a supported permanent Codebase Memory watcher; do not generalize that statement to every product/version.

Before a dependent graph query, keep task-local canonical-root identity and graph-dirty state. If identity is unknown, paginate:

```text
codebase-memory-mcp cli list_projects --detail identity --format json
```

Match the canonical `root_path`; follow `has_more`/`next_offset` until a match or the final page. If pagination ends without a usable match, classify identity as unusable/error, keep dirty/missing, block the dependent graph query, and never reuse the prior identity. Compute one coalesced update need when identity is missing/unusable, graph inputs are dirty, or the graph request is explicitly strict-current. If needed, run exactly one:

```text
codebase-memory-mcp cli index_repository --repo-path "<absolute-root>" --mode full
```

The CLI decides its internal no-op/incremental/full work. On every successful index, use the returned usable `project` identity and replace the agent-local identity; paginate only if that response lacks usable identity. If that lookup is exhausted without a usable match, retain dirty/missing and block the dependent graph query; never reuse the prior identity. Clear dirty and continue only after successful update with usable identity. If indexing fails, retain dirty/missing state and do not run or present dependent graph results as current.

Mark graph-dirty after known graph-input changes such as checkout/pull, generation, edit, rename/delete, or graph-affecting configuration. Batch changes and refresh once before the next dependent graph query. Do not use `index_status` or automatically call `check_index_coverage`; use coverage only for a concrete coverage problem. `search_graph` locates candidates, while bounded relationship queries support relationship claims. Strict-current text uses direct read/rg; strict-current syntax uses ast-grep.
