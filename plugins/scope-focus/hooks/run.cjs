'use strict';

const fs = require('node:fs');
const path = require('node:path');

const hookFile = name => path.join(__dirname, name);
const read = name => fs.readFileSync(hookFile(name), 'utf8');
const userPromptOutput = additionalContext => JSON.stringify({
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext }
});

exports.sessionStart = () => {
  try {
    const context = `${read('session.txt')}\nFor a complete long explanation, read ${path.join(__dirname, "..", "skills", "html-brief", "SKILL.md")} and use its template; read it only when that format is needed.`;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context }
    }));
  } catch (error) {
    process.stderr.write(`Scope Focus SessionStart unavailable: ${error.message}\n`);
    process.exitCode = 1;
  }
};

exports.solReminders = () => {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (error) {
    process.stderr.write(`Scope Focus SolReminders unavailable: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || input.hook_event_name !== 'SessionStart'
    || input.model !== 'gpt-5.6-sol') return;

  try {
    const context = `Read ${hookFile('notifications.txt')} now and every 6 actions.\nRead ${hookFile('absolute.txt')} every 66 actions.\nThese reminders apply only while the current model is gpt-5.6-sol.`;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context }
    }));
  } catch (error) {
    process.stderr.write(`Scope Focus SolReminders unavailable: ${error.message}\n`);
    process.exitCode = 1;
  }
};

exports.userPromptSubmit = () => {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (!input || typeof input.prompt !== 'string') throw new Error('input.prompt must be a string');
    process.stdout.write(userPromptOutput(read('submit.txt')));
  } catch (error) {
    process.stderr.write(`Scope Focus UserPromptSubmit unavailable: ${error.message}\n`);
    process.exitCode = 1;
  }
};
