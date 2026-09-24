'use strict';

const fs = require('node:fs');

const REASON = 'Прямой tgrep serve/index запрещён; используй filesystem-search wrapper от корня текущего проекта';

function readInput(eventName) {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return undefined;
  }
  return input && typeof input === 'object' && input.hook_event_name === eventName ? input : undefined;
}

function tokenize(command) {
  if (Array.isArray(command)) return command.filter(token => typeof token === 'string');
  if (typeof command !== 'string') return [];
  const tokens = [];
  let current = '';
  let quote = null;
  const pushCurrent = () => {
    if (current !== '') {
      tokens.push(current);
      current = '';
    }
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      pushCurrent();
      continue;
    }
    if (ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')' || ch === '<' || ch === '>') {
      pushCurrent();
      continue;
    }
    current += ch;
  }
  pushCurrent();
  return tokens;
}

function isTgrepToken(token) {
  if (token === 'tgrep' || token === 'tgrep.exe') return true;
  const normalized = token.replace(/\\/g, '/');
  return normalized.endsWith('/tgrep') || normalized.endsWith('/tgrep.exe');
}

function hasForbiddenTgrepLifecycle(tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    if (!isTgrepToken(tokens[i])) continue;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const token = tokens[j];
      if (token.startsWith('-')) continue;
      if (token === 'serve' || token === 'index') return true;
      break;
    }
  }
  return false;
}

function denyRoleInput() {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: REASON,
    },
  }));
}

function preToolUse() {
  const input = readInput('PreToolUse');
  if (!input || !input.tool_input || !input.tool_input.command) return;
  const tokens = tokenize(input.tool_input.command);
  if (hasForbiddenTgrepLifecycle(tokens)) denyRoleInput();
}

exports.preToolUse = preToolUse;
