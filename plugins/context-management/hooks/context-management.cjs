'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function input(expected) {
  try {
    const value = JSON.parse(fs.readFileSync(0, 'utf8'));
    return value && typeof value === 'object' && value.hook_event_name === expected ? value : null;
  } catch { return null; }
}

function threadId(value) {
  const id = value.agent_id || value.session_id;
  return typeof id === 'string' && id ? id : null;
}

function childId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const key of ['agent_id', 'agentId', 'thread_id', 'threadId', 'task_name']) {
    if (typeof value[key] === 'string' && value[key]) return value[key];
  }
  return null;
}

function targetThread(value) {
  const tool = value.tool_input && typeof value.tool_input === 'object' ? value.tool_input : {};
  for (const key of ['target', 'thread_id', 'threadId', 'agent_id', 'agentId']) {
    if (typeof tool[key] === 'string' && tool[key]) return tool[key];
  }
  if (value.tool_name === 'spawn_agent' && typeof tool.task_name === 'string' && tool.task_name) {
    const parentId = threadId(value);
    if (!parentId) return null;
    const parent = parentId.replace(/\/$/, '');
    return tool.task_name.startsWith('/') ? tool.task_name : `${parent}/${tool.task_name}`;
  }
  return null;
}

function call(operation, thread, args, requestId) {
  const cli = path.join(process.env.PLUGIN_ROOT || path.dirname(__dirname), 'memory.js');
  const body = { args };
  if (requestId) body.request_id = requestId;
  const result = spawnSync(process.execPath, [cli, 'call', operation, '--thread-id', thread], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    timeout: 6000,
    env: process.env,
    windowsHide: true,
  });
  let parsed;
  try { parsed = JSON.parse(result.stdout || '{}'); } catch {}
  if (result.error) return { error: { code: 'hook_call_failed', message: result.error.message } };
  if (!parsed || parsed.error || result.status !== 0) {
    return { error: parsed?.error || { code: 'hook_call_failed', message: (result.stderr || `memory.js exited ${result.status}`).trim() } };
  }
  return parsed;
}

function emitContext(event, text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

function bootstrap(expected) {
  const value = input(expected); if (!value) return;
  const thread = threadId(value);
  if (!thread) {
    emitContext(expected, 'Context Management error during bootstrap: thread_id_missing. Report this actual error to the parent agent or user. Continue with the context already available.');
    return;
  }
  const result = call('context.bootstrap', thread, {});
  if (result.error) {
    emitContext(expected, `Context Management error during bootstrap: ${JSON.stringify(result.error)}. Report this actual error to the parent agent or user. Continue with the context already available.`);
    return;
  }
  emitContext(expected, `Restore task context from this Context Management bootstrap. Read linked exact originals only when the current task needs them. Do not run a separate health check. If history_error is present, report that actual error to the parent agent or user. Bootstrap: ${JSON.stringify(result.result)}`);
}

function saveRecord(expected, destination, origin, stableId, role, value, payload, extraRefs = {}) {
  const raw = JSON.stringify(payload ?? null);
  const args = {
    stable_id: stableId,
    origin_thread: origin,
    role,
    text: raw,
    raw,
    tool_name: value.tool_name || null,
    refs: { tool_name: value.tool_name || null, tool_use_id: value.tool_use_id || null, agent_id: value.agent_id || null, turn_id: value.turn_id || null, parent_thread: origin, ...extraRefs },
  };
  const receipt = `${stableId}:${crypto.createHash('sha256').update(destination).digest('hex').slice(0, 16)}`;
  const result = call('history.record', destination, args, receipt);
  if (result.error) emitContext(expected, `Context Management failed to save an inter-agent record: ${JSON.stringify(result.error)}. Report this actual error to the parent agent or user. The tool call remains allowed.`);
}

function record(expected, suffix, role, field) {
  const value = input(expected); if (!value) return;
  const current = threadId(value);
  if (!current) {
    emitContext(expected, 'Context Management failed to save an inter-agent record: thread_id_missing. Report this actual error to the parent agent or user. The tool call remains allowed.');
    return;
  }
  const payload = value[field];
  const raw = JSON.stringify(payload ?? null);
  const toolUse = value.tool_use_id || crypto.createHash('sha256').update(`${value.turn_id || ''}:${value.tool_name || ''}:${raw}`).digest('hex');
  const stableId = `${toolUse}:${suffix}`;
  const targetHint = targetThread(value);
  if (suffix === 'input') {
    saveRecord(expected, current, current, stableId, role, value, payload, { target_hint: targetHint });
    return;
  }
  const target = value.tool_name === 'spawn_agent' ? childId(payload) : (childId(payload) || targetHint);
  const inputId = `harness:${current}:${toolUse}:input`;
  const outputId = `harness:${current}:${toolUse}:output`;
  saveRecord(expected, current, current, stableId, role, value, payload, { related_input_id: inputId, resolved_child_id: target });
  if (target && target !== current) {
    saveRecord(expected, String(target), current, `${toolUse}:transfer`, 'user', value, {
      parent_thread: current,
      tool_input: value.tool_input ?? null,
      tool_response: payload ?? null,
    }, { related_input_id: inputId, related_output_id: outputId, resolved_child_id: target });
  }
}

function sessionStart() { bootstrap('SessionStart'); }
function subagentStart() { bootstrap('SubagentStart'); }
function preToolUse() { record('PreToolUse', 'input', 'user', 'tool_input'); }
function postToolUse() { record('PostToolUse', 'output', 'assistant', 'tool_response'); }

module.exports = { sessionStart, subagentStart, preToolUse, postToolUse };
