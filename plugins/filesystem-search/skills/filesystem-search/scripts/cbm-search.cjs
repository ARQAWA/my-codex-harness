#!/usr/bin/env node
'use strict';
const { parseRoot } = require('./root-guard.cjs');
const { request, validateQuery } = require('./cbm-runtime.cjs');
(async () => {
  try {
    const [, , rootArg, tool, ...args] = process.argv;
    const root = parseRoot(rootArg);
    validateQuery(root, tool, args);
    const result = await request(root, 'query', tool, args).catch(error => ({
      code: 75, stderr: `CBM_BACKEND_UNAVAILABLE: ${error.message}\n`,
    }));
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exitCode = result.code;
  } catch (error) {
    if (error.message !== '__wrapper_exit__') { console.error(error.message); process.exitCode = 2; }
  }
})();
