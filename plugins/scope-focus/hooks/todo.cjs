'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// One script serves the todo hooks: UserPromptSubmit shows the open list, Stop returns the model to open items.
// Subagent events and any failure do nothing and print nothing, except a todo list that cannot be read: that blocks,
// so the list is never shown or taken for empty.
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // Missing or invalid input leaves no event to handle.
}

const block = (reason) => process.stdout.write(JSON.stringify({ decision: 'block', reason }));

function main() {
  if (typeof input.agent_id === 'string' && input.agent_id !== '') return;
  if (typeof input.session_id !== 'string' || input.session_id === '') return;
  const { allItems, loadState, openSnapshot, TODO_REMINDER } = require(join(__dirname, '..', 'tools', 'todo.cjs'));
  switch (input.hook_event_name) {
    case 'UserPromptSubmit': {
      let state;
      try {
        state = loadState(input.session_id);
      } catch (error) {
        block(`The todo list of this session cannot be read (${error.message}). The message was not sent; repeat it after fixing the cause.`);
        break;
      }
      process.stdout.write(openSnapshot(state) || TODO_REMINDER);
      break;
    }
    case 'Stop': {
      if (input.stop_hook_active === true) break;
      let state;
      try {
        state = loadState(input.session_id);
      } catch (error) {
        block(`The todo list of this session cannot be read (${error.message}); it was not changed. Fix it or report the problem to the owner before finishing.`);
        break;
      }
      const open = allItems(state)
        .filter((entry) => entry.item.status === 'pending' || entry.item.status === 'in_progress')
        .map((entry) => `${entry.num} ${entry.item.content} (${entry.item.status})`);
      if (open.length === 0) break;
      block(`Open todo items: ${open.join('; ')}. Before finishing, mark each done, drop it if no longer needed, or block it with a reason if it waits for the user or another event.`);
      break;
    }
    default:
      break;
  }
}

try {
  main();
} catch {
  // Failures stay silent: the hook exits 0 with no output.
}
