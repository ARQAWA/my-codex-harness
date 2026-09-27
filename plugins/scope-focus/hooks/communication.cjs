'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Registered events accept plain stdout as additional developer context.
// Read the installed source; do not keep a second copy or inspect user content.
const source = join(__dirname, '..', 'skills', 'clear-communication', 'SKILL.md');
process.stdout.write(`Apply the following communication skill before every user-facing message. Source: ${source}\n\n${readFileSync(source, 'utf8')}`);
