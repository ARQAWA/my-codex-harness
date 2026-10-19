'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// SubagentStop removes the record of a finished subagent; communication.cjs writes it at SubagentStart and the Stop
// hook reads it. SubagentStart is handled here too, so the record can be written directly.
// Codex gives both events the session id of Main and the agent id. Failures stay silent and print nothing.
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // Missing or invalid input leaves no event to handle.
}

try {
  const { markStarted, markStopped } = require(join(__dirname, 'running.cjs'));
  const sessionId = input.session_id;
  const agentId = input.agent_id;
  if (typeof sessionId === 'string' && sessionId !== '' && typeof agentId === 'string' && agentId !== '') {
    if (input.hook_event_name === 'SubagentStart') markStarted(sessionId, agentId, input.transcript_path);
    else if (input.hook_event_name === 'SubagentStop') markStopped(sessionId, agentId);
  }
} catch {
  // The record is a convenience for the stop check; a failure must not affect the subagent.
}
