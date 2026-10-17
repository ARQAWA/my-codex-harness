#!/usr/bin/env node
// Test double for `codex exec`: logs its argv and stdin, then answers from FAKE_CODEX_RULES.
// A rule emits one change for the owner message whose text matches it, and only when that message is in the input.
// FAKE_CODEX_FAIL=1 fails every call; FAKE_CODEX_FAIL_AFTER=N lets the first N calls succeed and fails the rest.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const stdin = readFileSync(0, 'utf8');
const previous = process.env.FAKE_CODEX_LOG && existsSync(process.env.FAKE_CODEX_LOG)
  ? readFileSync(process.env.FAKE_CODEX_LOG, 'utf8').split('\n').filter((line) => line !== '').length
  : 0;
if (process.env.FAKE_CODEX_LOG) {
  appendFileSync(process.env.FAKE_CODEX_LOG, `${JSON.stringify({ argv: args, cwd: process.cwd(), stdin, recorder: process.env.SCOPE_FOCUS_DECISION_RECORDER ?? null })}\n`);
}
const failAfter = process.env.FAKE_CODEX_FAIL_AFTER === undefined ? Infinity : Number(process.env.FAKE_CODEX_FAIL_AFTER);
if (process.env.FAKE_CODEX_FAIL === '1' || previous >= failAfter) {
  process.stderr.write('simulated failure with key sk-abcdef123456\n');
  process.exit(3);
}

const out = args[args.indexOf('--output-last-message') + 1];
const rules = JSON.parse(readFileSync(process.env.FAKE_CODEX_RULES, 'utf8'));
const input = JSON.parse(stdin);
const registry = input.registry;
const messages = [
  { id: input.currentOwner.id, role: 'owner', text: input.currentOwner.text },
  ...input.precedingAssistant.map((record) => ({ id: record.id, role: 'assistant', text: record.text })),
];
const changes = [];
for (const rule of rules) {
  const owner = messages.find((m) => m.role === 'owner' && (rule.exact ? m.text === rule.match : m.text.includes(rule.match)));
  if (!owner) continue;
  const change = { op: rule.op, id: '', text: rule.text ?? '', quote: rule.quote, confirmed: '', source: owner.id, confirmedSource: '' };
  if (rule.targetQuote) {
    const target = registry.find((d) => d.quote === rule.targetQuote);
    if (!target) continue;
    change.id = target.id;
  }
  if (rule.confirmed) {
    const proposal = messages.find((m) => m.role === 'assistant' && m.text.includes(rule.confirmed));
    change.confirmed = rule.confirmed;
    change.confirmedSource = proposal ? proposal.id : '';
  }
  changes.push(change);
}
writeFileSync(out, JSON.stringify({ changes }));
