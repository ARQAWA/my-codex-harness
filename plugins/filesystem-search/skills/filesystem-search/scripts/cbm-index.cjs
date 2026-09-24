#!/usr/bin/env node
'use strict';
const { parseRoot, fail } = require('./root-guard.cjs');
const { request } = require('./cbm-runtime.cjs');
(async () => {
  try {
    const [, , rootArg, ...rest] = process.argv;
    const root = parseRoot(rootArg);
    if (rest.length) fail('cbm-index takes no extra arguments');
    const result = await request(root, 'refresh');
    process.stdout.write(result.stdout || JSON.stringify({ project: result.project }) + '\n');
    process.stderr.write(result.stderr || '');
    process.exitCode = result.code;
  } catch (error) {
    if (error.message !== '__wrapper_exit__') { console.error(`CBM_BACKEND_UNAVAILABLE: ${error.message}`); process.exitCode = 75; }
  }
})();
