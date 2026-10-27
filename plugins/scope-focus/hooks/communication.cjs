'use strict';

const { existsSync, readFileSync, statSync } = require('node:fs');
const { homedir } = require('node:os');
const { delimiter, join } = require('node:path');

// Registered events accept plain stdout as additional developer context.
// Only the event name, the session start source, the session id, the agent id and the agent's rollout path are used;
// prompts and transcripts are never read. SubagentStart also records the running subagent for the Stop hook.
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

// Programs reported to the agent in the environment line.
const ENV_PROGRAMS = ['git', 'node', 'bun', 'npm', 'pnpm', 'python3', 'python', 'cargo', 'rustc', 'go', 'java', 'docker', 'gh', 'rg', 'fd', 'jq', 'make', 'cmake'];

function onPath(name) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return (process.env.PATH || '').split(delimiter).some((dir) => dir !== '' && suffixes.some((suffix) => {
    const file = join(dir, name + suffix);
    try {
      return existsSync(file) && statSync(file).isFile();
    } catch {
      return false;
    }
  }));
}

function environment() {
  const found = ENV_PROGRAMS.filter(onPath);
  const home = homedir().replace(/\\/g, '/');
  const winExtra = process.platform === 'win32' ? ', never /c/... or backslashes' : '';
  return `Environment: paths: absolute like ${home}/... with forward slashes${winExtra}; programs on PATH: ${found.length ? found.join(', ') : 'none found'}.`;
}

// After a compaction or a resume the open todo list comes back into the context.
function todoSnapshot() {
  if (input.source !== 'compact' && input.source !== 'resume') return [];
  if (typeof input.session_id !== 'string' || input.session_id === '') return [];
  try {
    const { allItems, isOpen, loadState, snapshot } = require(todoCli);
    const state = loadState(input.session_id);
    return allItems(state).some((entry) => isOpen(entry.item.status)) ? [snapshot(state)] : [];
  } catch {
    return [];
  }
}

if (input.hook_event_name === 'SubagentStart') {
  try {
    if (typeof input.session_id === 'string' && input.session_id !== '' && typeof input.agent_id === 'string' && input.agent_id !== '') {
      require(join(__dirname, 'running.cjs')).markStarted(input.session_id, input.agent_id, input.transcript_path);
    }
  } catch {
    // The record is a convenience for the stop check; a failure must not suppress the instructions.
  }
}

if (input.hook_event_name === 'SessionStart' && input.source !== 'compact') {
  try {
    if (typeof input.session_id === 'string' && input.session_id !== '') require(join(__dirname, 'running.cjs')).clearSession(input.session_id);
  } catch {
    // A failure keeps the old records; the stale limit still frees Main.
  }
}

const sections = input.hook_event_name === 'SubagentStart'
  ? [codexTools]
  : [
      `${codexTools}\nTodo CLI: node "${todoCli}"`,
      skill('Apply the following todo rules to every task.', 'todo'),
      environment(),
      ...todoSnapshot(),
    ];
process.stdout.write(sections.join('\n\n'));
