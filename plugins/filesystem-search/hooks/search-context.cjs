'use strict';

process.stdout.write([
  'For open-ended project discovery, use the native filesystem-search MCP route:',
  '- Codebase Memory MCP for code symbols, callers, dependencies, and impact.',
  '- tgrep MCP for filenames, literal text, documentation, and configuration.',
  '- Use ast-grep MCP when indexed results do not answer a syntax question.',
  'Read a known exact path directly. Check current, complete, and negative claims against current source or a narrow ordinary search.',
  'Respect explicit user tool constraints. Do not prepare an index before the first search.',
  'For explicit Codebase Memory index_repository calls, set persistence: false. Native MCP servers manage their own indexes.'
].join('\n'));
