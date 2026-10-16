'use strict';

const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

// One script serves the plan hooks: PostToolUse records update_plan,
// UserPromptSubmit shows the plan and Stop returns the model to open steps.
// Subagent events and any failure do nothing and print nothing.
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // Missing or invalid input leaves no event to handle.
}

const statuses = ['pending', 'in_progress', 'completed'];
const marks = { completed: '✓', in_progress: '●', pending: '○' };
const emptyPlanText = 'No plan steps are open. Before the first action of a new task that needs more than one answer or one short action, create its plan with update_plan; plan the steps before acting, mark progress during the work, and complete every step at handover. A finished plan is replaced for the next task.';
const stopInstruction = 'Before finishing, mark each one completed, remove it from the plan if it is no longer needed, or, if it waits for the user or another event, say so in the explanation of update_plan and end the turn.';

const keepItems = (list) => list
  .filter((item) => typeof item?.step === 'string' && statuses.includes(item.status))
  .map((item) => ({ step: item.step, status: item.status }));

const readPlan = (file) => {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data) ? keepItems(data) : [];
  } catch {
    return [];
  }
};

const toolArgs = () => {
  if (typeof input.tool_input !== 'string') return input.tool_input;
  try {
    return JSON.parse(input.tool_input);
  } catch {
    return undefined;
  }
};

const planTarget = () => {
  const dataDir = process.env.PLUGIN_DATA;
  if (typeof input.session_id !== 'string' || typeof dataDir !== 'string' || dataDir === '') {
    return null;
  }
  const name = input.session_id.replace(/[^A-Za-z0-9_.-]/g, '_');
  return { dataDir, file: join(dataDir, `plan-${name}.json`) };
};

const recordPlan = (target) => {
  const plan = toolArgs()?.plan;
  if (!Array.isArray(plan)) return;
  mkdirSync(target.dataDir, { recursive: true });
  writeFileSync(target.file, JSON.stringify(keepItems(plan)));
};

const remindPlan = (target) => {
  const plan = readPlan(target.file);
  if (plan.some((item) => item.status !== 'completed')) {
    const lines = plan.map((item) => `${marks[item.status]} ${item.step}`);
    process.stdout.write(['Current plan (update_plan):', ...lines].join('\n'));
    return;
  }
  process.stdout.write(emptyPlanText);
};

const holdOpenPlan = (target) => {
  if (input.stop_hook_active === true) return;
  const open = readPlan(target.file)
    .filter((item) => item.status === 'pending' || item.status === 'in_progress');
  if (open.length === 0) return;
  const reason = [
    'The plan still has open steps:',
    ...open.map((item) => `- ${item.step} (${item.status})`),
    stopInstruction,
  ].join('\n');
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
};

const main = () => {
  if (typeof input.agent_id === 'string' && input.agent_id !== '') return;
  const target = planTarget();
  if (!target) return;
  switch (input.hook_event_name) {
    case 'PostToolUse':
      recordPlan(target);
      break;
    case 'UserPromptSubmit':
      remindPlan(target);
      break;
    case 'Stop':
      holdOpenPlan(target);
      break;
    default:
      break;
  }
};

try {
  main();
} catch {
  // Failures stay silent: the hook exits 0 with no output.
}
