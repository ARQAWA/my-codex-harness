'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hookFile = name => path.join(__dirname, name);
const read = name => fs.readFileSync(hookFile(name), 'utf8');
const userPromptOutput = additionalContext => JSON.stringify({
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext }
});

exports.sessionStart = () => {
  try {
    let context = `${read('session.txt')}\nFor an HTML report, read ${path.join(__dirname, "..", "skills", "html-brief", "SKILL.md")} and use its template and brevity rules; read it only when that format is needed.`;
    let input;
    try {
      input = JSON.parse(fs.readFileSync(0, 'utf8'));
    } catch {}
    const sessionId = input?.hook_event_name === 'SessionStart' ? input.session_id : null;
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      const sessionKey = Buffer.from(sessionId, 'utf8').toString('hex');
      const plan = path.join(os.tmpdir(), 'scope-focus', 'task-notebook', sessionKey, 'plan.md');
      context += `\nTask Notebook session_id: ${sessionId}\nTask Notebook plan: ${plan}\nThis is a locator, not activation or permission to create a notebook.`;
      if (fs.existsSync(plan)) {
        const skill = path.join(__dirname, '..', 'skills', 'task-notebook', 'SKILL.md');
        context += `\nRead only the plan header first: session, task, explicit selection source, and status. Only for the same continuing explicitly selected task in working, waiting, or blocked status, read ${skill} and the current order, then apply newer user instructions before continuing. Do not load the skill or resume work for a complete, cancelled, or unrelated task. A new order requires a new explicit selection.`;
      }
    } else {
      context += '\nTask Notebook automatic restore locator unavailable: SessionStart session_id is missing. Report this limitation only if Task Notebook is needed; continue compatible work with the available context.';
    }
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context }
    }));
  } catch (error) {
    process.stderr.write(`Scope Focus SessionStart unavailable: ${error.message}\n`);
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
