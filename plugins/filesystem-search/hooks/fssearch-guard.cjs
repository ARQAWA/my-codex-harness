'use strict';
const fs = require('node:fs');
const path = require('node:path');
const SCRIPTS = path.resolve(__dirname, '../skills/filesystem-search/scripts');
const WRAPPERS = new Set(['tgrep-search.cjs', 'ast-grep-search.cjs', 'cbm-index.cjs', 'cbm-search.cjs']);
const HELP = new Set(['-h', '--help', '-V', '--version']);
const basename = value => path.posix.basename(value.replace(/\\/g, '/'));
const executable = value => basename(value).replace(/\.exe$/i, '');

// Only literal standalone wrapper invocations are rewritten. This is not a
// general shell interpreter or a security sandbox.
function parse(command) {
  if (Array.isArray(command)) return { segments: [command], compound: false, expansion: false };
  if (typeof command !== 'string') throw new Error('invalid shell command');
  const segments = [[]];
  let word = '', started = false, quote = '', expansion = false, compound = false;
  const push = () => { if (started) segments.at(-1).push(word); word = ''; started = false; };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") { if (c === quote) quote = ''; else word += c; continue; }
    if (c === '\\') {
      const next = command[i + 1];
      if (next === undefined) throw new Error('unfinished shell escape');
      if (quote === '"' && !['$', '`', '"', '\\', '\n'].includes(next)) word += c;
      else { word += next; i++; }
      started = true; continue;
    }
    if (c === '$' || c === '`') expansion = true;
    if (quote === '"') { if (c === quote) quote = ''; else word += c; continue; }
    if (c === '"' || c === "'") { quote = c; started = true; continue; }
    if (';&|()<>\n'.includes(c)) { push(); segments.push([]); compound = true; continue; }
    if (/\s/.test(c)) { push(); continue; }
    word += c; started = true;
  }
  if (quote) throw new Error('unfinished shell quote');
  push();
  return { segments: segments.filter(x => x.length), compound, expansion };
}
const quoteShell = value => "'" + value.replace(/'/g, "'\\''") + "'";
function emit(decision, reason, command) {
  const hookSpecificOutput = { hookEventName: 'PreToolUse', permissionDecision: decision };
  if (reason) hookSpecificOutput.permissionDecisionReason = reason;
  if (command) hookSpecificOutput.updatedInput = { command };
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}

function preToolUse() {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (input.hook_event_name !== 'PreToolUse') return;
    const parsed = parse(input.tool_input?.command);
    let wrapper;
    for (const tokens of parsed.segments) {
      if (!tokens.every(x => typeof x === 'string')) throw new Error('invalid command arguments');
      let start = 0;
      while (start < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[start])
          || ['env', 'exec', 'command', 'if', 'then', 'elif', 'do', '!'].includes(tokens[start]))) start++;
      if (start === tokens.length) continue;
      const call = tokens.slice(start);
      const command = executable(call[0]);
      if (['tgrep', 'ast-grep', 'sg'].includes(command)) {
        if (call.length === 2 && HELP.has(call[1])) continue;
        return emit('deny', 'Поиск и индексация — через filesystem-search wrapper');
      }
      if (command === 'codebase-memory-mcp') {
        if ((call.length === 2 && HELP.has(call[1])) || call[1] === 'config') continue;
        // Global identity inspection and explicit deletion remain administrative CLI operations.
        const tool = call.slice(2).find(x => !x.startsWith('-'));
        if (call[1] === 'cli' && ['list_projects', 'delete_project'].includes(tool)) continue;
        return emit('deny', 'CBM поиск и индексация — через cbm-search.cjs / cbm-index.cjs');
      }
      if (command === 'node' && call[1]) {
        const name = basename(call[1]);
        if (name === 'cbm-runtime.cjs') return emit('deny', 'CBM daemon запускает только обёртка');
        if (WRAPPERS.has(name)) {
          if (start) return emit('deny', 'Обёртку запускай отдельной командой без env-префиксов');
          wrapper = tokens;
        }
      }
    }
    if (!wrapper) return;
    if (parsed.compound || parsed.expansion || parsed.segments.length !== 1) {
      return emit('deny', 'Обёртку запускай отдельной командой с буквальными аргументами');
    }
    const canonical = value => {
      const real = fs.realpathSync.native(value);
      return process.platform === 'win32' ? real.toLowerCase() : real;
    };
    if (!path.isAbsolute(wrapper[1]) || canonical(wrapper[1]) !== canonical(path.join(SCRIPTS, basename(wrapper[1])))) {
      return emit('deny', 'Используй абсолютный путь обёртки установленного filesystem-search');
    }
    if (typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd)) throw new Error('missing session cwd');
    const root = fs.realpathSync.native(input.cwd);
    if (!fs.statSync(root).isDirectory()) throw new Error('invalid session cwd');
    emit('allow', null, `FSSEARCH_SESSION_ROOT=${quoteShell(root)} ${wrapper.map(quoteShell).join(' ')}`);
  } catch (error) { emit('deny', `filesystem-search hook: ${error.message}`); }
}
exports.preToolUse = preToolUse;
