'use strict';

// Test-only preload (NODE_OPTIONS): the todo hook runs without a recorder call, because updatePrompt is
// replaced in this process. Production code never loads this file.
const { join } = require('node:path');

const decisions = require(join(__dirname, '..', '..', 'plugins', 'scope-focus', 'tools', 'decisions.cjs'));
decisions.updatePrompt = () => ({ status: 'stubbed' });
