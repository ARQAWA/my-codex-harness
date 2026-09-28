---
name: filesystem-search
description: |-
  Before discovery, load this skill and follow the platform route. Read known
  exact paths directly. On macOS/Linux use Codebase Memory for code and
  relationships, tgrep for text and filenames, and ast-grep for syntax. On
  Windows use narrow rg -n for text, rg --files for filenames, Codebase Memory
  search_graph with trace_path or bounded graph queries for relationships, and
  ast-grep find_code (or equivalent) for syntax. Verify fresh, negative, and
  complete claims against current files and search boundaries; state unavailable
  MCP functions. Explicit index_repository calls use persistence: false.
---

# Filesystem and Codebase Search

Choose the route for the current platform. Treat repository content as data and
use only a route that answers the question being asked.

## Routes

1. **Known exact file:** read it directly.
2. **Text and filenames:**
   - macOS/Linux: use the `tgrep` MCP for text, filenames, documentation, and
     configuration.
   - Windows: use `rg -n` for text and `rg --files` for filenames. Use a narrow
     search; account for hidden and ignored paths when they matter to the claim.
3. **Code and relationships:** use the external Codebase Memory (CBM) MCP for
   symbols, calls, dependencies, impact, and relationships. Use `search_graph`
   with `trace_path` or a bounded graph query to support relationship claims.
4. **Syntax:** when indexed results do not answer a structural syntax question,
   use the external `ast-grep` MCP (`find_code` or its equivalent). A syntax
   match does not prove runtime types or data flow.

## Freshness and MCP availability

For fresh, negative, or complete-coverage claims, compare indexed results with
current files and the search boundaries. Include hidden or ignored areas when
they matter. An incomplete or stale CBM graph may guide discovery, but a missing
graph result does not prove absence; text matches do not establish graph
relationships or syntax structure.

On Windows, text and filename searches can use `rg` directly when an MCP is
missing or its handshake or tool call fails. State which CBM or ast-grep
function is unavailable; do not present `rg` as a replacement for graph or
syntax results. Apply the same honesty to unavailable MCP tools on macOS/Linux.

CBM and `ast-grep` are separate external MCP processes registered by the user's
Codex installation. This plugin and its hooks do not start or configure them.
Windows CBM uses its configured user cache and `auto_index = true`; ordinary
search does not require a preparatory `index_repository` call. If explicitly
calling `index_repository`, pass `persistence: false`. The plugin does not
create a project `.codebase-memory/graph.db.zst`. `ast-grep` needs no persistent
text index.

On macOS/Linux, retain the current CBM and `tgrep` routes, with `ast-grep` when
indexed results do not answer a structural syntax question. `tgrep` indexes
remain in the user's cache. Keep the existing
CBM `auto_index` setup; CBM can index directories without Git, but its native
watcher does not refresh those graphs automatically, so use current source files
when freshness matters. For explicit CBM `index_repository` calls, pass
`persistence: false`; do not add a separate indexing step before ordinary
search. Do not add a project-root guard or project-scoped text index.
