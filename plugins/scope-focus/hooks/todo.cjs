'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// One script serves the todo hooks: UserPromptSubmit shows the open list, Stop returns the model to open items.
// Subagent events and any failure do nothing and print nothing.
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // Missing or invalid input leaves no event to handle.
}

const main = () => {
  if (typeof input.agent_id === 'string' && input.agent_id !== '') return;
  if (typeof input.session_id !== 'string' || input.session_id === '') return;
  const { allItems, isOpen, loadState, snapshot, TODO_REMINDER } = require(join(__dirname, '..', 'tools', 'todo.cjs'));
  switch (input.hook_event_name) {
    case 'UserPromptSubmit': {
      const state = loadState(input.session_id);
      const open = allItems(state).some((entry) => isOpen(entry.item.status));
      process.stdout.write(open ? snapshot(state) : TODO_REMINDER);
      break;
    }
    case 'Stop': {
      if (input.stop_hook_active === true) break;
      const open = allItems(loadState(input.session_id))
        .filter((entry) => entry.item.status === 'pending' || entry.item.status === 'in_progress');
      if (open.length === 0) break;
      const reason = [
        'The todo list still has open items:',
        ...open.map((entry) => `- ${entry.num} ${entry.item.content} (${entry.item.status})`),
        'Before finishing, mark each one done, drop it if it is no longer needed, or block it with a reason if it waits for the user or another event.',
      ].join('\n');
      process.stdout.write(JSON.stringify({ decision: 'block', reason }));
      break;
    }
    default:
      break;
  }
};

try {
  main();
} catch {
  // Failures stay silent: the hook exits 0 with no output.
}
