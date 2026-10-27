'use strict';

const { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

// Todo list of the scope-focus plugin. Run as a CLI from the Codex shell, it edits the list of the
// current session; required as a library, it exports the read side that the hooks use.
// The op grammar and the texts are the stable contract of this CLI.
const STATUSES = ['pending', 'in_progress', 'completed', 'abandoned', 'blocked'];
const MARK = { completed: '✓', in_progress: '●', pending: '○', blocked: '⊘', abandoned: '✗' };
const TODO_REMINDER = [
  '<todo-reminder>',
  'No todo list is open. For a task that changes files or runs several stages, init its list together with your first tool calls; a question answered by reading, one answer and one short action need none.',
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

// A raw op as the failure report names it: its text, its label, or the value itself when it is no op at all.
function opName(raw) {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return label(raw);
  return JSON.stringify(raw);
}

// Drops optional fields that are null, empty strings or empty arrays, and a non-positive step.
function clean(value) {
  if (value === null) return undefined;
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

// An item sent as an object of the wrong shape, such as {"item": "text"}, can arrive as its JSON text.
// Such text is read back as the item it meant.
function parsedJson(text) {
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}')) && !(trimmed.startsWith('[') && trimmed.endsWith(']'))) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

const TITLE_KEYS = ['title', 'item'];
const PLAN_KEYS = ['plan'];

// True for a parsed object that names an item or a plan; other JSON-looking text, such as "[1]", stays plain text.
function isWrapper(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && [...TITLE_KEYS, ...PLAN_KEYS].some((key) => key in value);
}

// A list of step texts from a list, the JSON text of a list of texts, or an object wrapping one; undefined when any part
// is no step, so the op fails instead of dropping it. Other bracketed text, such as "[1, 2]", stays one step.
function stepList(value) {
  if (typeof value === 'string') {
    const parsed = parsedJson(value);
    if (isTextList(parsed) && parsed.length > 0) return parsed;
    return isWrapper(parsed) ? stepList(parsed) : [value];
  }
  if (Array.isArray(value)) {
    const parts = value.map(stepList);
    return parts.every((part) => part !== undefined) && parts.length > 0 ? parts.flat() : undefined;
  }
  if (isWrapper(value)) {
    for (const key of [...PLAN_KEYS, ...TITLE_KEYS]) {
      if (value[key] !== undefined) return stepList(value[key]);
    }
  }
  return undefined;
}

function itemSpec(spec) {
  let value = spec;
  if (typeof value === 'string') {
    const parsed = parsedJson(value);
    if (isWrapper(parsed)) value = parsed;
  }
  let title = '';
  let plan;
  if (typeof value === 'string') {
    title = value.trim();
  } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const key = TITLE_KEYS.find((name) => value[name] !== undefined);
    const inner = key === undefined ? undefined : value[key];
    if (typeof inner === 'string' && !isWrapper(parsedJson(inner))) {
      title = inner.trim();
    } else if (inner !== undefined) {
      // A wrapper such as {"item": {"title": ..., "plan": ...}}: the item is inside it.
      const nested = itemSpec(inner);
      title = nested.title;
      plan = nested.plan;
    }
    const rawPlan = PLAN_KEYS.map((name) => value[name]).find((part) => part !== undefined);
    if (rawPlan !== undefined) {
      plan = stepList(rawPlan);
      if (plan === undefined) throw new OpError(`the plan of "${title}" is not a list of steps`, 'write the plan as a list of step texts, or add it later with "plan <item>: step | step"');
    }
  }
  if (title === '') throw new OpError('an item has no title', 'write items as text, e.g. "init Phase: first item | second item"');
  return plan?.length ? { title, plan } : { title };
}

function claim(titles, title) {
  const key = normalize(title);
  if (titles.has(key)) throw new OpError(`item "${title}" is listed twice`, 'keep each title once; give one of them another title or drop it');
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
  if (query === undefined) throw new OpError(`${op} needs an item`, 'name the item by number like 2.3 or by its text, e.g. "done 2.3"');
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
  if (!active) throw new OpError(`${op} has no item and none is in progress`, 'name the item by number like 2.3 or by its text, e.g. "done 2.3"');
  return active;
}

function init(next, op) {
  if (!op.list?.length) throw new OpError('init has no list', 'write "init Phase: item | item"');
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
  if (!op.items?.length) throw new OpError('append has no items', 'write "append: item | item"');
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
    if (taken.has(normalize(title))) throw new OpError(`item "${title}" already exists`, 'use the existing item by its number, or give this one another title');
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

const OP_NAMES = new Set(['init', 'append', 'start', 'done', 'drop', 'block', 'unblock', 'rm', 'plan', 'step', 'closed']);

// A short op written as text, "<op> [item or phase][: text]": "done 1.2", "start 1.3", "step", "step 3",
// "block 1.4: waits for the key", "plan: first | second", "plan 2.1: first | second", "init Phase: item | item",
// "append: item | item", "append Phase: item", "closed".
function parseOpText(text) {
  const colon = text.indexOf(':');
  const head = (colon < 0 ? text : text.slice(0, colon)).trim();
  const tail = colon < 0 ? undefined : text.slice(colon + 1).trim();
  const [word = '', ...restWords] = head.split(/\s+/);
  const name = word.toLowerCase();
  if (!OP_NAMES.has(name)) {
    throw new OpError(`unknown op "${text}"`, 'write it as "<op> [item][: text]", e.g. "done 1.2" or "plan: first | second"');
  }
  const rest = restWords.join(' ').trim();
  const target = rest === '' ? undefined : rest;
  const parts = tail === undefined ? [] : tail.split('|').map((part) => part.trim()).filter((part) => part !== '');
  switch (name) {
    case 'init':
      return { op: name, list: [{ phase: target, items: parts }] };
    case 'append':
      return { op: name, phase: target, items: parts };
    case 'block':
      return { op: name, item: target, reason: tail };
    case 'plan':
      return { op: name, item: target, steps: parts };
    case 'step': {
      const words = rest === '' ? [] : rest.split(/\s+/);
      const last = words[words.length - 1];
      if (last !== undefined && /^\d+$/.test(last)) return { op: name, item: words.slice(0, -1).join(' ') || undefined, step: Number(last) };
      return { op: name, item: target };
    }
    case 'closed':
      return { op: name, phase: target };
    default:
      return { op: name, item: target ?? (tail || undefined) };
  }
}

function isTextList(value) {
  return Array.isArray(value) && value.every((part) => typeof part === 'string');
}

// The object form arrives as the model wrote it; a field of the wrong type fails here as an op, before any state changes.
function checkOp(op) {
  const wrong = (field, want) => new OpError(`${op.op} has ${field} that is not ${want}`, 'write the op as text, e.g. "done 1.2"');
  for (const field of ['item', 'phase', 'reason']) if (op[field] !== undefined && typeof op[field] !== 'string') throw wrong(field, 'text');
  if (op.step !== undefined && typeof op.step !== 'number') throw wrong('step', 'a number');
  if (op.steps !== undefined && !isTextList(op.steps)) throw wrong('steps', 'a list of texts');
  if (op.items !== undefined && !Array.isArray(op.items)) throw wrong('items', 'a list');
  if (op.list !== undefined && (!Array.isArray(op.list) || op.list.some((group) => typeof group !== 'object' || group === null || (group.items !== undefined && !Array.isArray(group.items))))) {
    throw wrong('list', 'a list of phases with items');
  }
}

function applyOp(next, op, report) {
  checkOp(op);
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
      // Without an item, done and drop close the current one.
      const target = resolveDefault(next, op.item, op.op);
      delete target.item.blocker;
      target.item.status = op.op === 'done' ? 'completed' : 'abandoned';
      return `${op.op === 'done' ? 'done' : 'dropped'} ${target.num}`;
    }
    case 'block': {
      const target = locate(next, op.item, 'block');
      const reason = op.reason?.trim();
      if (!reason) throw new OpError('block has no reason', 'write "block <item>: what it waits for"');
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
      const steps = op.steps === undefined ? undefined : stepList(op.steps);
      if (!steps?.length) throw new OpError('plan has no steps', 'write "plan: first step | second step"');
      op.steps = steps;
      const target = resolveDefault(next, op.item, 'plan');
      next.plans.set(itemKey(next, target), { steps: op.steps, current: 1 });
      return `plan ${target.num}: ${op.steps.length} steps`;
    }
    case 'step': {
      const target = resolveDefault(next, op.item, 'step');
      const plan = next.plans.get(itemKey(next, target));
      if (!plan) throw new OpError(`${target.num} has no plan`, `add its steps first: "plan ${target.num}: step | step"`);
      const total = plan.steps.length;
      if (op.step !== undefined) {
        const step = op.step;
        if (step <= 0 || step > total) throw new OpError(`step ${op.step} is outside 1..${total}`, `pass step from 1 to ${total}, or omit step to move on by one`);
        plan.current = step;
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
  if (!active) return 'No item is in progress; start one with "start <item>".';
  const plan = next.plans.get(itemKey(next, active));
  if (!plan) return `Next: ${active.num} "${active.item.content}" has no plan; add its steps with "plan: step | step".`;
  if (plan.current > plan.steps.length) return `All steps of ${active.num} are marked; close it with "done".`;
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
  const lines = ['<todo>', `Your todo list; item numbers work in every todo op. ${open} of ${entries.length} open; closed items are folded, list them with "closed".`];
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

// The finite number a step counter holds; a numeric string, as an older step op saved it, counts as that number.
function asNumber(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
}

// Plans are kept only for items that still exist; a kept plan must have the saved shape.
function livePlans(raw, phases) {
  const plans = new Map();
  const live = new Set(phases.flatMap((phase) => phase.tasks.map((item) => keyOf(phase.name, item.content))));
  for (const [key, plan] of Object.entries(raw)) {
    if (!live.has(key)) continue;
    const current = asNumber(plan?.current);
    if (!Array.isArray(plan?.steps) || plan.steps.length === 0 || !plan.steps.every((step) => typeof step === 'string') || current === undefined) {
      throw new Error('todo list plan has an unexpected shape; it was not changed');
    }
    plans.set(key, { steps: plan.steps, current });
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

// Only a missing file means an empty list. A file that cannot be read, is not JSON or has another shape throws
// and is left alone, so no later save can replace the list that was there.
function loadState(sessionId) {
  let text;
  try {
    text = readFileSync(stateFile(sessionId), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { phases: [], plans: new Map() };
    throw new Error(`todo list of session ${sessionId} cannot be read (${error.code || 'error'}); it was not changed`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`todo list of session ${sessionId} is not valid JSON; it was not changed`);
  }
  const shaped = typeof data === 'object' && data !== null && isPhases(data.phases)
    && (data.plans === undefined || (typeof data.plans === 'object' && data.plans !== null && !Array.isArray(data.plans)));
  if (!shaped) throw new Error(`todo list of session ${sessionId} has an unexpected shape; it was not changed`);
  return { phases: data.phases, plans: livePlans(data.plans ?? {}, data.phases) };
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

// Takes the session's lock file, waiting while a live call holds it; null after LOCK_WAIT_MS. The file records the owner's PID.
function acquireLock(sessionId) {
  const file = `${stateFile(sessionId)}.lock`;
  mkdirSync(stateDir(), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    let fd;
    try {
      fd = openSync(file, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (fd !== undefined) {
      writeFileSync(fd, String(process.pid));
      return { file, fd };
    }
    if (removeStaleLock(file)) continue;
    if (Date.now() >= deadline) return null;
    Atomics.wait(pause, 0, 0, LOCK_RETRY_MS);
  }
}

// Removes a lock whose owner is gone: its PID no longer runs, or it records no PID and is older than
// LOCK_STALE_MS. A lock of a live owner stays whatever its age. Returns true when the lock is gone, so the
// caller retries at once.
function removeStaleLock(file) {
  try {
    const owner = Number(readFileSync(file, 'utf8'));
    if (Number.isInteger(owner) && owner > 0) {
      try {
        process.kill(owner, 0);
        return false;
      } catch (probe) {
        // Only "no such process" proves the owner is gone; any other error keeps the lock.
        if (probe.code !== 'ESRCH') return false;
      }
    } else if (Date.now() - statSync(file).mtimeMs <= LOCK_STALE_MS) {
      return false;
    }
    unlinkSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

const USAGE = `todo needs ops: text arguments such as 'done 1.2' 'plan: first | second', or JSON {"ops":[...]} as the only argument or on stdin. Fix: node todo.cjs 'start 1.1'.`;
const NO_OPS = `todo needs at least one op. Fix: node todo.cjs 'start 1.1'.`;

// Parses a JSON ops text: {"ops":[...]} or a bare array. Undefined when the text is not JSON or has no ops array.
function parseJsonOps(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const ops = Array.isArray(parsed) ? parsed : parsed?.ops;
  return Array.isArray(ops) ? ops : undefined;
}

// The raw ops from argv or, without arguments, from stdin. Undefined when the JSON form is invalid.
function readOps() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args.length === 1 && /^[{[]/.test(args[0].trim())) return parseJsonOps(args[0].trim());
    return args;
  }
  let text = '';
  try {
    text = readFileSync(0, 'utf8');
  } catch {
    // Unreadable input leaves no ops; the no-ops error below reports it.
  }
  const trimmed = text.trim();
  if (/^[{[]/.test(trimmed)) return parseJsonOps(trimmed);
  return trimmed.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

// Applies the ops in order like the todo tool does; stops at the first failing op and keeps the earlier ones.
function runCli() {
  const sessionId = process.env.CODEX_THREAD_ID || '';
  if (sessionId === '') {
    console.error('todo: CODEX_THREAD_ID is not set; run this program from the Codex shell tool.');
    return 1;
  }
  const raw = readOps();
  if (raw === undefined) {
    console.error(USAGE);
    return 1;
  }
  const ops = raw.map((op) => clean(op)).filter((op) => op !== undefined);
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
function applyOps(sessionId, rawOps) {
  const start = loadState(sessionId);
  let working = structuredClone(start);
  const applied = [];
  const report = [];
  let failure;
  for (const [index, raw] of rawOps.entries()) {
    const trial = structuredClone(working);
    try {
      if (typeof raw !== 'string' && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
        throw new OpError(`op ${index + 1} is ${JSON.stringify(raw)}, not an op`, 'write it as text, e.g. "done 1.2"');
      }
      const op = typeof raw === 'string' ? parseOpText(raw) : raw;
      applied.push(applyOp(trial, op, report));
      working = settle(trial);
    } catch (failed) {
      // Malformed input that slipped past the checks fails like any op, never as a crash.
      const error = failed instanceof OpError
        ? failed
        : new OpError(failed instanceof Error ? failed.message : String(failed), 'write the op as text, e.g. "done 1.2"');
      failure = { index, error };
      break;
    }
  }

  const committed = applied.length > 0 ? working : start;
  const lines = [];
  if (applied.length > 0) lines.push(`${capitalize(applied.join('; '))}.`);
  if (failure) {
    const parts = [`Stopped at op ${failure.index + 1} (${opName(rawOps[failure.index])}): ${failure.error.reason}. Fix: ${failure.error.fix}.`];
    const rest = rawOps.slice(failure.index + 1).map((op, offset) => `op ${failure.index + 2 + offset} (${opName(op)})`);
    if (rest.length > 0) parts.push(`Not applied: ${rest.join(', ')}.`);
    lines.push(parts.join(' '));
    lines.push(snapshot(committed));
  } else {
    lines.push(nextLine(committed));
    if (allItems(committed).some((entry) => isOpen(entry.item.status))) lines.push(snapshot(committed));
  }
  lines.push(...report);
  if (applied.length > 0) saveState(sessionId, committed);
  process.stdout.write(`${lines.join('\n')}\n`);
  return failure ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    process.stderr.write(`todo: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { loadState, allItems, isOpen, snapshot, nextLine, TODO_REMINDER };
