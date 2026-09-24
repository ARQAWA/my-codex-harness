#!/usr/bin/env node
'use strict';

const cp = require('node:child_process');
const { parseRoot } = require('./root-guard.cjs');

(() => {
  try {
    const [, , rootArg, ...rest] = process.argv;
    const root = parseRoot(rootArg);
    if (rest.length) { console.error('cbm-index takes no extra arguments'); process.exitCode = 2; return; }
    const result = cp.spawnSync('codebase-memory-mcp', ['cli', 'index_repository', '--repo-path', root, '--mode', 'full'], { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    if (result.error) { console.error(`codebase-memory-mcp unavailable: ${result.error.message}`); process.exitCode = 2; return; }
    process.exitCode = result.status == null ? 2 : result.status;
  } catch (error) {
    if (error.message !== '__wrapper_exit__') { console.error(error.message); process.exitCode = 2; }
  }
})();
