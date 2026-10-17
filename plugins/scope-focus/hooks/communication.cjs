'use strict';

// The recorder's nested run gets no instructions: it ends before any rule is read.
if (process.env.SCOPE_FOCUS_DECISION_RECORDER === '1') process.exit(0);

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
const decisionsCli = join(__dirname, '..', 'tools', 'decisions.cjs');
const historyCli = join(__dirname, '..', 'tools', 'session-history.cjs');
const codexTools = `${skill('Apply the following Codex tool mechanics to every tool call.', 'codex-tools')}\nReader CLI: node "${readerCli}"`;

// Root sessions get the saved decisions; a read failure is reported with the CLI path instead of silence.
const decisionMemory = () => {
  if (typeof input.session_id !== 'string' || input.session_id === '') return '';
  try {
    const text = require(join(__dirname, '..', 'tools', 'decisions.cjs')).memoryText(input.session_id);
    return text === '' ? '' : `Session decisions of this session. Keep following them.\n\n${text}`;
  } catch (error) {
    return `Session decisions could not be read (${error.message}). Read them with node "${decisionsCli}" show before work.`;
  }
};

const sections = input.hook_event_name === 'SubagentStart'
  ? [codexTools]
  : [
      skill('Apply the full Gold Standard to all work. Apply silently.', 'gold-standard'),
      `${codexTools}\nTodo CLI: node "${todoCli}"\nDecisions CLI: node "${decisionsCli}"\nHistory CLI: node "${historyCli}"`,
      skill('Apply the following root Main workflow for the work classes, the todo list and the goal.', 'main-workflow'),
      skill('Apply the following subagent rules to every subagent launch.', 'subagents'),
      skill('Apply the following communication skill before every user-facing message.', 'clear-communication'),
      decisionMemory(),
    ];
process.stdout.write(sections.filter((section) => section !== '').join('\n\n'));
