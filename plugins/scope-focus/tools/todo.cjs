'use strict';

const { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

// Todo list of the scope-focus plugin. Run as a CLI from the Codex shell, it edits the list of the
// current session; required as a library, it exports the read side that the hooks use.
const STATUSES = ['pending', 'in_progress', 'completed', 'abandoned', 'blocked'];
const MARK = { completed: '✓', in_progress: '●', pending: '○', blocked: '⊘', abandoned: '✗' };
const TODO_REMINDER = [
  '<todo-reminder>',
  'No todo items are open. Before the first action of a new task, create its list with init. Extend an unfinished list with append for continued work. Plan items before acting, mark progress during the work, and close every item at handover. A closed list is replaced for the next multi-step task. Skip the list only for one answer, one short action, or the owner\'s explicit request to work without todo.',
  '</todo-reminder>',
].join('\n');

class OpError extends Error {
  constructor(reason, fix) {
    super(reason);
    this.reason = reason;
    this.fix = fix;
  }
}

function normalize(text) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u2192|\u21D2|\u27F6|=>|->/g, '->')
    .replace(/[\u2014\u2013\u2212\u2010\u2011]/g, '-')
    .replace(/[\u00AB\u00BB\u201C\u201D\u201E\u2018\u2019"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchBy(pool, text, query) {
  const wanted = normalize(query);
  if (wanted === '') return [];
  const exact = pool.filter((value) => normalize(text(value)) === wanted);
  if (exact.length > 0) return exact;
  return pool.filter((value) => {
    const candidate = normalize(text(value));
    return candidate !== '' && (candidate.includes(wanted) || wanted.includes(candidate));
  });
}

function keyOf(phaseName, title) {
  return `${phaseName}\u0000${title}`;
}

function isOpen(status) {
  return status === 'pending' || status === 'in_progress' || status === 'blocked';
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function label(op) {
  return op.item !== undefined ? `${op.op} ${op.item}` : op.op;
}

// Drops optional fields that are empty strings or empty arrays, and a non-positive step.
function clean(value) {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (Array.isArray(value)) {
    const kept = value.map(clean).filter((part) => part !== undefined);
    return kept.length > 0 ? kept : undefined;
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, part] of Object.entries(value)) {
      const cleaned = clean(part);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return value;
}

function allItems(next) {
  return next.phases.flatMap((phase, p) =>
    phase.tasks.map((item, i) => ({ phase: p, index: i, item, num: `${p + 1}.${i + 1}` })));
}

function itemKey(next, entry) {
  return keyOf(next.phases[entry.phase].name, entry.item.content);
}

function show(entry) {
  return `${entry.num} "${entry.item.content}"`;
}

function openList(next) {
  return allItems(next).filter((entry) => isOpen(entry.item.status)).map(show).join('; ') || 'none';
}

function itemSpec(spec) {
  const title = (typeof spec === 'string' ? spec : (spec.title ?? '')).trim();
  if (title === '') throw new OpError('an item has no title', 'give every item a title');
  const plan = typeof spec === 'string' ? undefined : spec.plan;
  return plan?.length ? { title, plan } : { title };
}

function claim(titles, title) {
  const key = normalize(title);
  if (titles.has(key)) {
    throw new OpError(`item "${title}" is listed twice`, 'keep each title once; give one of them another title or drop it');
  }
  titles.add(key);
}

// Phase by number (1-based, when in range), else by forgiving name match; an unknown name is a new phase.
function resolvePhase(next, query) {
  const text = query.trim();
  const number = /^\d+$/.test(text) ? Number(text) : 0;
  if (number >= 1 && number <= next.phases.length) return number - 1;
  const found = matchBy(
    next.phases.map((phase, i) => ({ phase, i })),
    (entry) => entry.phase.name,
    text,
  );
  if (found.length === 1) return found[0].i;
  if (found.length > 1) {
    throw new OpError(
      `several phases match "${text}": ${found.map((entry) => `${entry.i + 1} ${entry.phase.name}`).join(', ')}`,
      'repeat the op with phase set to one of these numbers or exact names',
    );
  }
  return text;
}

function defaultPhase(next) {
  const active = next.phases.findIndex((phase) => phase.tasks.some((item) => item.status === 'in_progress'));
  if (active >= 0) return active;
  const pending = next.phases.findIndex((phase) => phase.tasks.some((item) => item.status === 'pending'));
  if (pending >= 0) return pending;
  return next.phases.length - 1;
}

// Item by number ("2.3") or by text; several text matches resolve to the single open one.
function locate(next, query, op) {
  if (query === undefined) {
    throw new OpError(`${op} needs an item`, 'pass item: "<number like 2.3 or the exact item text>"');
  }
  if (typeof query !== 'string') throw new OpError('item must be a string', 'pass item: "<number like 2.3 or the exact item text>"');
  const text = query.trim();
  const entries = allItems(next);
  if (/^\d+\.\d+$/.test(text)) {
    const exact = entries.find((entry) => entry.num === text);
    if (exact) return exact;
    throw new OpError(`no item ${text}. Open items: ${openList(next)}`, 'repeat the op with item set to a number from the open items above');
  }
  const found = matchBy(entries, (entry) => entry.item.content, text);
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    const open = found.filter((entry) => isOpen(entry.item.status));
    if (open.length === 1) return open[0];
    throw new OpError(`several items match "${text}": ${found.map(show).join('; ')}`, 'repeat the op with item set to one of these numbers');
  }
  throw new OpError(`no item matches "${text}". Open items: ${openList(next)}`, 'repeat the op with item set to the number or exact text of an open item above');
}

// plan and step default to the in-progress item.
function resolveDefault(next, query, op) {
  if (query !== undefined) return locate(next, query, op);
  const active = allItems(next).find((entry) => entry.item.status === 'in_progress');
  if (!active) throw new OpError(`${op} has no item and none is in progress`, 'pass item: "<number like 2.3 or the exact item text>"');
  return active;
}

function init(next, op) {
  if (!op.list?.length) throw new OpError('init has no list', 'pass list: [{phase, items: [...]}]');
  const phases = [];
  const plans = new Map();
  const names = new Set();
  const titles = new Set();
  for (const group of op.list) {
    const name = (group.phase ?? '').trim();
    if (name === '') throw new OpError('a phase has no name', 'give every phase a name in list, e.g. {phase: "Research", items: [...]}');
    if (!group.items?.length) throw new OpError(`phase "${name}" has no items`, `give "${name}" at least one item, or drop it from list`);
    if (names.has(normalize(name))) throw new OpError(`phase "${name}" is listed twice`, 'merge its items into one phase entry');
    names.add(normalize(name));
    const tasks = [];
    for (const spec of group.items) {
      const { title, plan } = itemSpec(spec);
      claim(titles, title);
      tasks.push({ content: title, status: 'pending' });
      if (plan) plans.set(keyOf(name, title), { steps: plan, current: 1 });
    }
    phases.push({ name, tasks });
  }
  next.phases = phases;
  next.plans = plans;
  return `list set: ${allItems(next).length} items in ${phases.length} phases`;
}

function append(next, op) {
  if (!op.items?.length) throw new OpError('append has no items', 'pass items: ["title", {title, plan: [...]}]');
  const specs = op.items.map((spec) => itemSpec(spec));
  const taken = new Set(allItems(next).map((entry) => normalize(entry.item.content)));
  let index = -1;
  let name = 'Todos';
  if (op.phase !== undefined) {
    const target = resolvePhase(next, op.phase);
    if (typeof target === 'number') {
      index = target;
      name = next.phases[target].name;
    } else {
      name = target;
    }
  } else {
    index = defaultPhase(next);
    if (index >= 0) name = next.phases[index].name;
  }
  if (index < 0) {
    next.phases.push({ name, tasks: [] });
    index = next.phases.length - 1;
  }
  const phase = next.phases[index];
  const added = [];
  for (const { title, plan } of specs) {
    if (taken.has(normalize(title))) {
      throw new OpError(`item "${title}" already exists`, 'use the existing item by its number, or give this one another title');
    }
    taken.add(normalize(title));
    phase.tasks.push({ content: title, status: 'pending' });
    if (plan) next.plans.set(keyOf(phase.name, title), { steps: plan, current: 1 });
    added.push(`${index + 1}.${phase.tasks.length} "${title}"`);
  }
  return `added ${added.join(', ')} to ${phase.name}`;
}

// Lists the closed items of the covered phases: every phase, or the one phase given.
function closedLines(next, op) {
  let covered = next.phases.map((_phase, p) => p);
  if (op.phase !== undefined) {
    const target = resolvePhase(next, op.phase);
    if (typeof target === 'string') {
      const known = next.phases.map((phase, i) => `${i + 1} ${phase.name}`).join(', ') || 'none';
      throw new OpError(`no phase matches "${target}". Phases: ${known}`, 'repeat the op with phase set to a number or exact name from the phases above');
    }
    covered = [target];
  }
  const lines = [];
  for (const p of covered) {
    const phase = next.phases[p];
    const items = phase.tasks.flatMap((item, i) => (isOpen(item.status) ? [] : [`${p + 1}.${i + 1} ${MARK[item.status]} ${item.content}`]));
    if (items.length > 0) lines.push(`${p + 1} ${phase.name}`, ...items);
  }
  return lines.length > 0 ? lines : ['No closed items.'];
}

function applyOp(next, op, report) {
  switch (op.op) {
    case 'init':
      return init(next, op);
    case 'append':
      return append(next, op);
    case 'start': {
      const target = locate(next, op.item, 'start');
      for (const entry of allItems(next)) {
        if (entry.item.status === 'in_progress') entry.item.status = 'pending';
      }
      target.item.status = 'in_progress';
      return `started ${target.num} "${target.item.content}"`;
    }
    case 'done':
    case 'drop': {
      const target = locate(next, op.item, op.op);
      delete target.item.blocker;
      target.item.status = op.op === 'done' ? 'completed' : 'abandoned';
      return `${op.op === 'done' ? 'done' : 'dropped'} ${target.num}`;
    }
    case 'block': {
      const target = locate(next, op.item, 'block');
      if (op.reason !== undefined && typeof op.reason !== 'string') throw new OpError('reason must be a string', 'pass reason: "what the item waits for"');
      const reason = op.reason?.trim();
      if (!reason) throw new OpError('block has no reason', 'pass reason: "what the item waits for"');
      target.item.status = 'blocked';
      target.item.blocker = reason;
      return `blocked ${target.num}: ${reason}`;
    }
    case 'unblock': {
      const target = locate(next, op.item, 'unblock');
      delete target.item.blocker;
      target.item.status = 'pending';
      return `unblocked ${target.num}`;
    }
    case 'rm': {
      const target = locate(next, op.item, 'rm');
      const key = itemKey(next, target);
      next.phases[target.phase].tasks.splice(target.index, 1);
      next.plans.delete(key);
      return `removed ${target.num} "${target.item.content}"`;
    }
    case 'plan': {
      if (!op.steps?.length) throw new OpError('plan has no steps', 'pass steps: ["first step", "second step"]');
      if (!Array.isArray(op.steps) || !op.steps.every((step) => typeof step === 'string')) throw new OpError('steps must be a list of strings', 'pass steps: ["first step", "second step"]');
      const target = resolveDefault(next, op.item, 'plan');
      next.plans.set(itemKey(next, target), { steps: op.steps, current: 1 });
      return `plan ${target.num}: ${op.steps.length} steps`;
    }
    case 'step': {
      const target = resolveDefault(next, op.item, 'step');
      const plan = next.plans.get(itemKey(next, target));
      if (!plan) {
        throw new OpError(`${target.num} has no plan`, `add its steps first: {op:"plan", item:"${target.num}", steps:[...]}`);
      }
      const total = plan.steps.length;
      if (op.step !== undefined) {
        if (op.step > total) throw new OpError(`step ${op.step} is outside 1..${total}`, `pass step from 1 to ${total}, or omit step to move on by one`);
        plan.current = op.step;
      } else {
        plan.current = Math.min(plan.current + 1, total + 1);
      }
      return plan.current > total ? `all ${total} steps of ${target.num} marked` : `step ${target.num}: ${plan.current}/${total}`;
    }
    case 'closed':
      report.push(...closedLines(next, op));
      return 'listed closed items';
    default:
      throw new OpError(`unknown op ${String(op.op)}`, 'use one of init, append, start, done, drop, block, unblock, rm, plan, step, closed');
  }
}

// At most one item in progress; with none, the first pending item in list order starts.
function settle(next) {
  const entries = allItems(next);
  const active = entries.filter((entry) => entry.item.status === 'in_progress');
  for (const extra of active.slice(1)) extra.item.status = 'pending';
  if (active.length === 0) {
    const pending = entries.find((entry) => entry.item.status === 'pending');
    if (pending) pending.item.status = 'in_progress';
  }
  return next;
}

function nextLine(next) {
  const entries = allItems(next);
  if (!entries.some((entry) => isOpen(entry.item.status))) return 'All items are closed; the list leaves the context.';
  const active = entries.find((entry) => entry.item.status === 'in_progress');
  if (!active) return 'No item is in progress; start one with {op:"start",item:"…"}.';
  const plan = next.plans.get(itemKey(next, active));
  if (!plan) return `Next: ${active.num} "${active.item.content}" has no plan; add its steps with {op:"plan", steps:[…]}.`;
  if (plan.current > plan.steps.length) return `All steps of ${active.num} are marked; close it with {op:"done"}.`;
  return `Now: ${active.num} "${active.item.content}", step ${plan.current}/${plan.steps.length} "${plan.steps[plan.current - 1]}".`;
}

function planText(plan) {
  const total = plan.steps.length;
  const text = plan.steps
    .map((step, index) => {
      const mark = index + 1 < plan.current ? '✓' : index + 1 === plan.current ? '▸' : '○';
      return `${mark}${index + 1} ${step}`;
    })
    .join(' · ');
  return plan.current > total ? `${text} · all steps marked` : text;
}

function snapshot(next) {
  const entries = allItems(next);
  const open = entries.filter((entry) => isOpen(entry.item.status)).length;
  const lines = ['<todo>', `Your todo list; item numbers work in every todo op. ${open} of ${entries.length} open; closed items are folded, list them with {op:"closed"}.`];
  next.phases.forEach((phase, p) => {
    if (phase.tasks.length === 0) {
      lines.push(`${p + 1} ${phase.name} — empty`);
      return;
    }
    const closedCount = phase.tasks.filter((item) => !isOpen(item.status)).length;
    lines.push(`${p + 1} ${phase.name} — ${closedCount}/${phase.tasks.length} closed`);
    phase.tasks.forEach((item, i) => {
      if (!isOpen(item.status)) return;
      const blocked = item.status === 'blocked' ? ` — blocked: ${item.blocker ?? ''}` : '';
      lines.push(`  ${p + 1}.${i + 1} ${MARK[item.status]} ${item.content}${blocked}`);
      const plan = next.plans.get(keyOf(phase.name, item.content));
      if (item.status === 'in_progress' && plan) lines.push(`      plan: ${planText(plan)}`);
    });
  });
  lines.push('</todo>');
  return lines.join('\n');
}

// Plans are kept only for items that still exist.
function livePlans(raw, phases) {
  const plans = new Map();
  if (typeof raw !== 'object' || raw === null) return plans;
  const live = new Set(phases.flatMap((phase) => phase.tasks.map((item) => keyOf(phase.name, item.content))));
  for (const [key, plan] of Object.entries(raw)) {
    if (!plan || !live.has(key)) continue;
    if (!Array.isArray(plan.steps) || plan.steps.length === 0 || typeof plan.current !== 'number') continue;
    plans.set(key, { steps: plan.steps, current: plan.current });
  }
  return plans;
}

// A phase list in the saved shape: named phases with tasks, each task with its content and a known status.
function isPhases(value) {
  return Array.isArray(value) && value.every((phase) =>
    typeof phase === 'object' && phase !== null && typeof phase.name === 'string' && Array.isArray(phase.tasks) &&
    phase.tasks.every((item) =>
      typeof item === 'object' && item !== null && typeof item.content === 'string' && STATUSES.includes(item.status)));
}

function stateDir() {
  return join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'scope-focus-todo');
}

function stateFile(sessionId) {
  return join(stateDir(), `todo-${sessionId.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
}

// A missing or invalid file gives an empty list.
function loadState(sessionId) {
  let data;
  try {
    data = JSON.parse(readFileSync(stateFile(sessionId), 'utf8'));
  } catch {
    return { phases: [], plans: new Map() };
  }
  if (typeof data !== 'object' || data === null || !isPhases(data.phases)) return { phases: [], plans: new Map() };
  return { phases: data.phases, plans: livePlans(data.plans, data.phases) };
}

function saveState(sessionId, next) {
  const file = stateFile(sessionId);
  const tmp = `${file}.${process.pid}.tmp`;
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(tmp, JSON.stringify({ phases: next.phases, plans: Object.fromEntries(next.plans) }));
  renameSync(tmp, file);
}

const LOCK_WAIT_MS = 10000;
const LOCK_STALE_MS = 10000;
const LOCK_RETRY_MS = 20;
const pause = new Int32Array(new SharedArrayBuffer(4));

// Takes the session's lock file, waiting while another call holds it; null after LOCK_WAIT_MS.
function acquireLock(sessionId) {
  const file = `${stateFile(sessionId)}.lock`;
  mkdirSync(stateDir(), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      return { file, fd: openSync(file, 'wx') };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (removeStaleLock(file)) continue;
    if (Date.now() >= deadline) return null;
    Atomics.wait(pause, 0, 0, LOCK_RETRY_MS);
  }
}

// Removes a lock older than LOCK_STALE_MS. Returns true when the lock is gone, so the caller retries at once.
function removeStaleLock(file) {
  try {
    if (Date.now() - statSync(file).mtimeMs <= LOCK_STALE_MS) return false;
    unlinkSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

const USAGE = 'todo needs JSON {"ops":[...]}, as the first argument or on stdin. Fix: pass ops: [{"op":"start","item":"1.1"}].';
const NO_OPS = 'todo needs at least one op. Fix: pass ops: [{op: "start", item: "1.1"}].';

// Applies the ops in order like the todo tool does; stops at the first failing op and keeps the earlier ones.
function runCli() {
  const sessionId = process.env.CODEX_THREAD_ID || '';
  if (sessionId === '') {
    console.error('todo: CODEX_THREAD_ID is not set; run this program from the Codex shell tool.');
    return 1;
  }
  let text = '';
  try {
    text = process.argv.length > 2 ? process.argv[2] : readFileSync(0, 'utf8');
  } catch {
    // Unreadable input leaves no ops; the usage error below reports it.
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const rawOps = Array.isArray(parsed) ? parsed : parsed?.ops;
  if (!Array.isArray(rawOps)) {
    console.error(USAGE);
    return 1;
  }
  const ops = rawOps.map((raw) => clean(raw) ?? {});
  if (ops.length === 0) {
    console.error(NO_OPS);
    return 1;
  }

  const lock = acquireLock(sessionId);
  if (lock === null) {
    console.error('todo: the todo list is locked by another call; repeat the call.');
    return 1;
  }
  try {
    return applyOps(sessionId, ops);
  } finally {
    closeSync(lock.fd);
    unlinkSync(lock.file);
  }
}

// Loads the list, applies the ops and saves the result; runCli holds the lock around this call.
function applyOps(sessionId, ops) {
  const start = loadState(sessionId);
  let working = structuredClone(start);
  const applied = [];
  const report = [];
  let failure;
  for (const [index, op] of ops.entries()) {
    const trial = structuredClone(working);
    try {
      applied.push(applyOp(trial, op, report));
      working = settle(trial);
    } catch (failed) {
      if (!(failed instanceof OpError)) throw failed;
      failure = { index, error: failed };
      break;
    }
  }

  const committed = applied.length > 0 ? working : start;
  const lines = [];
  if (applied.length > 0) lines.push(`${capitalize(applied.join('; '))}.`);
  if (failure) {
    const parts = [`Stopped at op ${failure.index + 1} (${ops[failure.index].op}): ${failure.error.reason}. Fix: ${failure.error.fix}.`];
    const rest = ops.slice(failure.index + 1).map((op, offset) => `op ${failure.index + 2 + offset} (${label(op)})`);
    if (rest.length > 0) parts.push(`Not applied: ${rest.join(', ')}.`);
    lines.push(parts.join(' '));
    lines.push(snapshot(committed));
  } else {
    lines.push(nextLine(committed));
  }
  lines.push(...report);
  if (applied.length > 0) saveState(sessionId, committed);
  process.stdout.write(`${lines.join('\n')}\n`);
  return failure ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = { loadState, allItems, isOpen, snapshot, TODO_REMINDER };
