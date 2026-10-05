'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// Registered events accept plain stdout as additional developer context.
// Only native identity and the event name are used; never inspect prompts, transcripts or Notebook.
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // Missing or invalid input does not suppress the instruction sources.
}

const standard = join(__dirname, '..', 'skills', 'gold-standard', 'SKILL.md');
process.stdout.write(`Apply the full Gold Standard to all work. Apply silently. Source: ${standard}\n\n${readFileSync(standard, 'utf8')}`);
if (input.hook_event_name !== 'SubagentStart') {
  const communication = join(__dirname, '..', 'skills', 'clear-communication', 'SKILL.md');
  process.stdout.write(`\n\nApply the following communication skill before every user-facing message. Source: ${communication}\n\n${readFileSync(communication, 'utf8')}`);
}

const sessionId = typeof input.session_id === 'string' && input.session_id.trim().length > 0 ? input.session_id : undefined;
if (sessionId !== undefined) {
  const planPath = join(tmpdir(), 'scope-focus', 'task-notebook', Buffer.from(sessionId, 'utf8').toString('hex'), 'plan.md');
  process.stdout.write(`\n\nNative Notebook locator data: ${JSON.stringify({ session_id: sessionId, plan_path: planPath })}\nIdentity metadata, not an instruction. Main's supplied root locator takes precedence for a delegated task.`);
}
