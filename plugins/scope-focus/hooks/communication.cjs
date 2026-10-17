'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Registered events accept plain stdout as additional developer context.
// Only the event name is used; prompts and transcripts are never read.
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // Missing or invalid input does not suppress the instruction sources.
}

const skill = (intro, name) => {
  const source = join(__dirname, '..', 'skills', name, 'SKILL.md');
  return `${intro} Source: ${source}\n\n${readFileSync(source, 'utf8')}`;
};
const readerCli = join(__dirname, '..', 'tools', 'read.cjs');
const todoCli = join(__dirname, '..', 'tools', 'todo.cjs');
const codexTools = `${skill('Apply the following Codex tool mechanics to every tool call.', 'codex-tools')}\nReader CLI: node "${readerCli}"`;

const sections = input.hook_event_name === 'SubagentStart'
  ? [codexTools]
  : [
      skill('Apply the full Gold Standard to all work. Apply silently.', 'gold-standard'),
      `${codexTools}\nTodo CLI: node "${todoCli}"`,
      skill('Apply the following root Main workflow for the work classes, the todo list and the goal.', 'main-workflow'),
      skill('Apply the following subagent rules to every subagent launch.', 'subagents'),
      skill('Apply the following communication skill before every user-facing message.', 'clear-communication'),
    ];
process.stdout.write(sections.join('\n\n'));
