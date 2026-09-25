# Codebase Memory CLI

Run searches through:

```text
node "<skill-root>/scripts/cbm-search.cjs" "<absolute-root>" <tool> [--flag value | --flag=value]...
```

Allowed tools: `search_graph`, `query_graph`, `trace_path`, `get_code_snippet`, `get_file_outline`, `get_graph_schema`, `get_architecture`, `search_code`, `check_index_coverage`. Arguments retain native CLI meanings. The wrapper owns `project`; raw JSON, args files, root/project overrides, and mutation commands are rejected. Explicit file paths must be root-relative and contained. Select candidates with `search_graph`; support relationship claims with bounded graph/path queries.

The wrapper handles paginated root-to-project identity lookup, first-index readiness, and one packaged Rust daemon per canonical root. An existing graph is usable while the daemon refreshes it. No agent-local dirty flags or repeated `list_projects` calls are needed. To wait for an explicit refresh:

```text
node "<skill-root>/scripts/cbm-index.cjs" "<absolute-root>"
```

The daemon runs one `index_repository --repo-path <root> --mode full` at a time, without `--persistence`. Its central graph remains in CBM's store. It watches the canonical root recursively through filesystem events, independent of Git, and coalesces events for five seconds. CBM's native indexer applies `.gitignore`, `.cbmignore`, and standard exclusions, including for non-Git roots. Startup reconciles a saved graph once. Failed updates retry next cycle and queries warn `CBM_INDEX_STALE`; no usable graph gives exit `75`. Removing the root stops its daemon without deleting the graph.

An SQLite exclusive transaction owns the daemon across crashes and concurrent starts; local IPC carries ready/refresh/query requests. Runtime state is under `<active-codex-home>/filesystem-search/cbm/<hash>/`. Unix sockets are in `/tmp`; Windows uses a named pipe. No MCP is used. Direct daemon launches are not an agent-facing interface.

Administrative identity inspection and explicitly requested `delete_project --project <name>` remain native CLI operations. Deletion is never automatic. CBM's native `.gitignore`, `.cbmignore`, and coverage exclusions remain authoritative. Indexed answers permit short background lag; strict-current graph work explicitly refreshes first.
