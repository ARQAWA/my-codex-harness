'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Leave space for the host's envelope below Main's 8192-byte output guard.
const PACKET_BYTES = 6000;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error(`Invalid ${label}; expected an object with only these fields: ${keys.join(', ')}`);
  }
}
function strings(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
}
function pointer(root, expression) {
  if (expression === '') return root;
  if (!expression.startsWith('/') || /~(?![01])/u.test(expression)) {
    throw new Error('Invalid JSON pointer');
  }
  let value = root;
  for (const token of expression.slice(1).split('/')) {
    const key = token.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (value === null || typeof value !== 'object' || !own(value, key)
        || (Array.isArray(value) && !/^(0|[1-9]\d*)$/u.test(key))) {
      throw new Error('JSON pointer is missing (distinct from null or empty)');
    }
    value = value[key];
  }
  return value;
}
function readSource(source, index) {
  object(source, ['path', 'json_pointer'], `source ${index}`);
  if (typeof source.path !== 'string' || !path.isAbsolute(source.path)
      || (own(source, 'json_pointer') && typeof source.json_pointer !== 'string')) {
    throw new Error(`Source ${index} requires an absolute path and an optional JSON pointer`);
  }
  const locator = { source: index, ...source };
  let status;
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      .decode(fs.readFileSync(source.path));
    let value = text;
    if (own(source, 'json_pointer')) {
      const root = JSON.parse(text);
      const response = root && typeof root === 'object' && own(root, 'tool_response')
        ? root.tool_response : root;
      if (response && typeof response === 'object') {
        status = Object.fromEntries(['status', 'exit_code', 'isError']
          .filter(key => own(response, key)).map(key => [key, response[key]]));
      }
      value = pointer(root, source.json_pointer);
      locator.representation = typeof value === 'string' ? 'decoded-string' : 'formatted-json';
    }
    const rendered = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return { locator, value, rendered, ...(status && Object.keys(status).length ? { status } : {}) };
  } catch (error) {
    return { locator, error: error.code || error.message,
      ...(status && Object.keys(status).length ? { status } : {}) };
  }
}
function excerpt(reference, sources) {
  object(reference, ['source', 'start_line', 'end_line', 'start_char', 'end_char'], 'reference');
  const { source, start_line: start, end_line: end } = reference;
  if (!Number.isInteger(source) || source < 0 || source >= sources.length
      || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw new Error('Invalid source index or line range');
  }
  const selected = sources[source];
  if (selected.error) throw new Error(`Source ${source} is unavailable: ${selected.error}`);
  const lines = selected.rendered.split('\n');
  if (end > lines.length) throw new Error(`Source ${source}: line range exceeds ${lines.length} lines`);
  let text = lines.slice(start - 1, end).join('\n');
  if (own(reference, 'start_char') || own(reference, 'end_char')) {
    const from = reference.start_char;
    const to = reference.end_char;
    const chars = [...text];
    if (start !== end || !Number.isInteger(from) || !Number.isInteger(to)
        || from < 1 || to < from || to > chars.length) {
      throw new Error(`Source ${source}: invalid character range`);
    }
    text = chars.slice(from - 1, to).join('');
  }
  return { ...reference, text };
}
function prepareContext(input) {
  try {
    object(input, ['mode', 'question', 'sources', 'facts', 'errors', 'unknowns', 'outcome'], 'request');
    if (!['read', 'pack'].includes(input.mode) || typeof input.question !== 'string'
        || !input.question.trim() || !Array.isArray(input.sources) || !input.sources.length) {
      throw new Error('mode, a concrete question, and nonempty sources are required');
    }
    const sources = input.sources.map(readSource);
    const locators = sources.map(({ locator, error, status }) => ({
      ...locator, ...(error ? { error } : {}), ...(status ? { status } : {}),
    }));
    if (input.mode === 'read') {
      return { question: input.question, sources: sources.map((source, index) => ({
        ...locators[index], ...(source.error ? {} : {
          value_type: source.value === null ? 'null' : Array.isArray(source.value) ? 'array' : typeof source.value,
          numbered_text: source.rendered.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n'),
          lines: source.rendered.split('\n').length,
        }),
      })) };
    }
    strings(input.errors, 'errors');
    strings(input.unknowns, 'unknowns');
    if (!Array.isArray(input.facts)) throw new Error('facts must be an array');
    const facts = input.facts.map(fact => {
      object(fact, ['text', 'references'], 'fact');
      if (typeof fact.text !== 'string' || !Array.isArray(fact.references) || !fact.references.length) {
        throw new Error('Each fact requires text and at least one source reference');
      }
      return { text: fact.text, excerpts: fact.references.map(ref => excerpt(ref, sources)) };
    });
    if (own(input, 'outcome')) {
      object(input.outcome, ['status', 'changed_paths'], 'outcome');
      if (typeof input.outcome.status !== 'string') throw new Error('outcome.status must be a string');
      strings(input.outcome.changed_paths, 'outcome.changed_paths');
    }
    const packet = {
      sources: locators, facts, errors: input.errors, unknowns: input.unknowns,
      ...(input.outcome ? { reported_outcome: input.outcome } : {}),
    };
    const bytes = Buffer.byteLength(JSON.stringify(packet), 'utf8');
    if (bytes > PACKET_BYTES) {
      return { error: 'PACKET_TOO_LARGE', bytes, limit: PACKET_BYTES,
        instruction: 'Narrow excerpts or the question. Preserve material errors and unknowns; no content was silently truncated.' };
    }
    return packet;
  } catch (error) {
    return { error: error.message };
  }
}

let output;
try {
  output = prepareContext(JSON.parse(fs.readFileSync(0, 'utf8')));
} catch (error) {
  output = { error: error.message };
}
process.stdout.write(`${JSON.stringify(output)}\n`);
if (own(output, 'error')) process.exitCode = 1;
