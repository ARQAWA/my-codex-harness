'use strict';

// Kimi port of the Scope Focus UserPromptSubmit hook.
// Kimi differences from Codex handled here:
// - stdin `prompt` is ContentPart[] ({type:'text',text}), not a string.
// - hook stdout is injected into the model context AND shown in the TUI;
//   there is no silent additionalContext channel, so emit the submit text
//   as plain stdout (user chose the full port).
// - runs with cwd = plugin root; KIMI_PLUGIN_ROOT also available.
const KIMI_PLUGIN_ROOT = process.env.KIMI_PLUGIN_ROOT || null;
void KIMI_PLUGIN_ROOT;

const fs = require('node:fs');
const path = require('node:path');

const SUBMIT_FILE = path.join(__dirname, 'submit.txt');

function promptText(prompt) {
  if (typeof prompt === 'string') return prompt;
  if (Array.isArray(prompt)) {
    return prompt
      .filter(part => part && typeof part.text === 'string')
      .map(part => part.text)
      .join('\n');
  }
  throw new Error('input.prompt must be a string or ContentPart[]');
}

function userPromptSubmit() {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    promptText(input.prompt);
    process.stdout.write(fs.readFileSync(SUBMIT_FILE, 'utf8'));
  } catch (error) {
    process.stderr.write(`Scope Focus UserPromptSubmit unavailable: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  userPromptSubmit();
}

exports.userPromptSubmit = userPromptSubmit;
exports.promptText = promptText;
