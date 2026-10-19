'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// One script serves the todo hooks: UserPromptSubmit shows the open list, Stop first keeps Main from finishing while a
// subagent it launched still runs, then returns the model to open items.
// Subagent events and any failure do nothing and print nothing, except a todo list that cannot be read: that blocks,
// so the list is never shown or taken for empty.
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // Missing or invalid input leaves no event to handle.
}

const block = (reason) => process.stdout.write(JSON.stringify({ decision: 'block', reason }));

const main = async () => {
  if (typeof input.agent_id === 'string' && input.agent_id !== '') return;
  if (typeof input.session_id !== 'string' || input.session_id === '') return;
  const { allItems, isOpen, loadState, snapshot, TODO_REMINDER } = require(join(__dirname, '..', 'tools', 'todo.cjs'));
  switch (input.hook_event_name) {
    case 'UserPromptSubmit': {
      let state;
      try {
        state = loadState(input.session_id);
      } catch (error) {
        block(`The todo list of this session cannot be read (${error.message}). The message was not sent; repeat it after fixing the cause.`);
        break;
      }
      const open = allItems(state).some((entry) => isOpen(entry.item.status));
      process.stdout.write(open ? snapshot(state) : TODO_REMINDER);
      break;
    }
    case 'Stop': {
      // First in the stop order, like the omp subagent check, so the todo check never drops a final.
      let running = 0;
      try {
        running = require(join(__dirname, 'running.cjs')).runningCount(input.session_id);
      } catch {
        running = 0;
      }
      if (running > 0) {
        block(`${running} subagent task(s) still running. Do not write your final answer yet: call wait_agent and continue with the finals it delivers. Never poll and never run filler commands such as pwd, ls or git status.`);
        break;
      }
      if (input.stop_hook_active === true) break;
      let state;
      try {
        state = loadState(input.session_id);
      } catch (error) {
        block(`The todo list of this session cannot be read (${error.message}); it was not changed. Fix it or report the problem to the owner before finishing.`);
        break;
      }
      const open = allItems(state)
        .filter((entry) => entry.item.status === 'pending' || entry.item.status === 'in_progress');
      if (open.length === 0) break;
      const reason = [
        'The todo list still has open items:',
        ...open.map((entry) => `- ${entry.num} ${entry.item.content} (${entry.item.status})`),
        'Before finishing, mark each one done, drop it if it is no longer needed, or block it with a reason if it waits for the user or another event.',
      ].join('\n');
      block(reason);
      break;
    }
    default:
      break;
  }
};

main().catch(() => {
  // Failures stay silent: the hook exits 0 with no output.
});
