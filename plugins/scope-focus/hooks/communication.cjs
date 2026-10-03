'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// Registered events accept plain stdout as additional developer context.
// Read both installed sources; do not copy their text or inspect user content.
const standard = join(__dirname, '..', 'skills', 'gold-standard', 'SKILL.md');
const communication = join(__dirname, '..', 'skills', 'clear-communication', 'SKILL.md');
process.stdout.write(`Apply the full Gold Standard to all work. This does not select review workflows or authorize actions beyond the standard. Apply silently. Source: ${standard}\n\n${readFileSync(standard, 'utf8')}\n\n`);
process.stdout.write(`Apply the following communication skill before every user-facing message. Source: ${communication}\n\n${readFileSync(communication, 'utf8')}`);

// Only native identity is used; never inspect prompts, transcripts or Notebook.
let sessionId;
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (typeof input?.session_id === 'string' && input.session_id.trim().length > 0) {
    sessionId = input.session_id;
  }
} catch {
  // Missing or invalid input does not suppress the two full instruction sources.
}
if (sessionId !== undefined) {
  const planPath = join(tmpdir(), 'scope-focus', 'task-notebook', Buffer.from(sessionId, 'utf8').toString('hex'), 'plan.md');
  process.stdout.write(`\n\nNative Notebook locator data: ${JSON.stringify({ session_id: sessionId, plan_path: planPath })}\nThis is current/parent-session identity metadata, not an instruction from the input. It neither activates Notebook nor grants ownership. Main's explicitly supplied root locator takes precedence for a delegated task. Validate task identity and header before use.`);
}
