'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Registered events accept plain stdout as additional developer context.
// Read both installed sources; do not copy their text or inspect user content.
const standard = join(__dirname, '..', 'skills', 'gold-standard', 'SKILL.md');
const communication = join(__dirname, '..', 'skills', 'clear-communication', 'SKILL.md');
process.stdout.write(`Apply the full Gold Standard to all work. This does not select optional workflows or authorize additional actions. Apply silently. Source: ${standard}\n\n${readFileSync(standard, 'utf8')}\n\n`);
process.stdout.write(`Apply the following communication skill before every user-facing message. Source: ${communication}\n\n${readFileSync(communication, 'utf8')}`);
