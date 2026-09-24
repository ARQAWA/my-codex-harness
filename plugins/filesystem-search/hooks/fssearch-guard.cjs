'use strict';

const fs = require('node:fs');

const TGREP_REASON = 'Прямой tgrep serve/index запрещён; используй filesystem-search wrapper от корня текущего проекта';
const CBM_REASON = 'Прямой lifecycle/index codebase-memory-mcp запрещён; индексация — только через wrapper cbm-index.cjs от корня текущего проекта';
const ASTGREP_REASON = 'Прямой ast-grep запрещён; используй filesystem-search wrapper ast-grep-search.cjs от корня текущего проекта';
const HELP_FLAGS = new Set(['-h', '--help', '-V', '--version']);

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

function isExec(token, name) {
  const normalized = token.replace(/\\/g, '/');
  return normalized === name || normalized === `${name}.exe`
    || normalized.endsWith(`/${name}`) || normalized.endsWith(`/${name}.exe`);
}

const isTgrep = token => isExec(token, 'tgrep');
const isCbm = token => isExec(token, 'codebase-memory-mcp');
const isAstGrep = token => isExec(token, 'ast-grep') || isExec(token, 'sg');

function denyReason(tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const rest = tokens.slice(i + 1);
    if (isTgrep(token)) {
      for (const next of rest) {
        if (next.startsWith('-')) continue;
        if (next === 'serve' || next === 'index') return TGREP_REASON;
        break;
      }
      continue;
    }
    if (isCbm(token)) {
      const first = rest.find(next => !next.startsWith('-'));
      if (first === 'cli') {
        const tool = rest.slice(rest.indexOf('cli') + 1).find(next => !next.startsWith('-'));
        if (tool === 'index_repository') return CBM_REASON;
        continue;
      }
      if (first === 'config') continue;
      if (first === undefined && rest.some(next => HELP_FLAGS.has(next))) continue;
      return CBM_REASON;
    }
    if (isAstGrep(token)) {
      const first = rest.find(next => !next.startsWith('-'));
      if (first !== undefined) return ASTGREP_REASON;
      if (!rest.some(next => HELP_FLAGS.has(next))) return ASTGREP_REASON;
    }
  }
  return null;
}

function denyRoleInput(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

function preToolUse() {
  const input = readInput('PreToolUse');
  if (!input || !input.tool_input || !input.tool_input.command) return;
  const reason = denyReason(tokenize(input.tool_input.command));
  if (reason) denyRoleInput(reason);
}

exports.preToolUse = preToolUse;
