'use strict';

const lines = process.platform === 'win32'
  ? [
      'Windows filesystem-search routing:',
      '- Read known exact paths directly; use rg -n for text and rg --files for filenames.',
      '- Use the external Codebase Memory MCP search_graph with trace_path or a bounded graph query for code relationships.',
      '- Use the external ast-grep MCP find_code (or equivalent) for syntax.',
      '- If an MCP handshake or call fails, state which function is unavailable; verify fresh, negative, or complete claims against current files and relevant hidden/ignored search boundaries.',
      '- CBM auto_index is user-configured; do not index_repository before ordinary search. If explicitly called, pass persistence: false.'
    ]
  : [
      'macOS/Linux filesystem-search routing:',
      '- Read known exact paths directly.',
      '- Use the external Codebase Memory MCP for code and relationships, tgrep MCP for text and filenames, and ast-grep MCP when indexed results do not answer a syntax question.',
      '- Verify fresh, negative, or complete claims against current files and relevant search boundaries; state when an MCP function is unavailable.',
      '- For explicit Codebase Memory index_repository calls, pass persistence: false; do not prepare a separate index before ordinary search.'
    ];

process.stdout.write(lines.join('\n'));
