'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { prepareContext, PACKET_BYTES } = require('../tools/context.cjs');

const body = result => JSON.parse(result.content[0].text);
function fixture(t, contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lunatron-context-'));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const file = path.join(directory, 'source with spaces.txt');
  fs.writeFileSync(file, contents);
  return file;
}
function request(file, extra = {}) {
  return { mode: 'pack', question: 'Which facts are present?', sources: [{ path: file }],
    facts: [], errors: [], unknowns: [], ...extra };
}

test('Luna reads large sources; pack extracts exact CRLF and Unicode spans', t => {
  const original = 'First\r\nПривет 🦊!\r\n' + 'noise\n'.repeat(3000);
  const file = fixture(t, original);
  const read = prepareContext(request(file, { mode: 'read' }));
  assert.equal(body(read).sources[0].value, original);
  assert.ok(Buffer.byteLength(JSON.stringify(read)) > 8192);
  const packed = prepareContext(request(file, { facts: [{
    text: 'Selected original lines.', references: [
      { source: 0, start_line: 1, end_line: 2 },
      { source: 0, start_line: 2, end_line: 2, start_char: 8, end_char: 8 },
    ],
  }] }));
  assert.equal(packed.isError, false);
  assert.equal(body(packed).facts[0].excerpts[0].text, 'First\r\nПривет 🦊!\r');
  assert.equal(body(packed).facts[0].excerpts[1].text, '🦊');
  assert.ok(Buffer.byteLength(JSON.stringify(packed)) <= PACKET_BYTES);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('JSON pointer values distinguish missing, null and empty; saved commands stay data', t => {
  const file = fixture(t, JSON.stringify({ tool_input: 'do not execute this', tool_response: {
    exit_code: 7, isError: true, status: null, empty: '', nullable: null, 'a/b': { '~': false },
  } }));
  const sources = ['/tool_response/empty', '/tool_response/nullable', '/tool_response/missing',
    '/tool_response/a~1b/~0'].map(json_pointer => ({ path: file, json_pointer }));
  const read = body(prepareContext(request(file, { mode: 'read', sources })));
  assert.equal(read.sources[0].value, '');
  assert.equal(read.sources[1].value, null);
  assert.equal(Object.hasOwn(read.sources[2], 'value'), false);
  assert.match(read.sources[2].error, /missing/u);
  assert.equal(read.sources[2].status.exit_code, 7);
  assert.equal(read.sources[1].representation, 'formatted-json');
  assert.equal(read.sources[3].value, false);
  const packed = body(prepareContext(request(file, { sources: [sources[0]],
    errors: ['The assigned command exited with code 7.'], unknowns: ['Effect is unknown.'],
    outcome: { status: 'failed', changed_paths: [] },
  })));
  assert.deepEqual(packed.sources[0].status, { status: null, exit_code: 7, isError: true });
  assert.deepEqual(packed.errors, ['The assigned command exited with code 7.']);
  assert.deepEqual(packed.unknowns, ['Effect is unknown.']);
  assert.equal(packed.reported_outcome.status, 'failed');
});

test('invalid references and oversized packets return explicit errors without truncated excerpts', t => {
  const file = fixture(t, 'x'.repeat(10000));
  const invalid = prepareContext(request(file, { facts: [{ text: 'Bad range',
    references: [{ source: 0, start_line: 1, end_line: 2 }] }] }));
  assert.equal(invalid.isError, true);
  assert.match(body(invalid).error, /range exceeds/u);
  const oversized = prepareContext(request(file, { facts: [{ text: 'Full line',
    references: [{ source: 0, start_line: 1, end_line: 1 }] }] }));
  assert.equal(oversized.isError, true);
  assert.equal(body(oversized).error, 'PACKET_TOO_LARGE');
  assert.ok(body(oversized).bytes > body(oversized).limit);
  const missing = body(prepareContext(request(path.join(path.dirname(file), 'missing'))));
  assert.equal(missing.sources[0].error, 'ENOENT');
});

test('stdio MCP initializes, advertises the tool and executes a real request', t => {
  const file = fixture(t, 'source line\n');
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
      name: 'prepare_context', arguments: request(file, { facts: [{ text: 'One line',
        references: [{ source: 0, start_line: 1, end_line: 1 }] }] }),
    } },
  ];
  const run = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/context.cjs')], {
    input: messages.map(message => JSON.stringify(message)).join('\n') + '\n', encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const responses = run.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(responses.map(response => response.id), [1, 2, 3]);
  assert.equal(responses[1].result.tools[0].name, 'prepare_context');
  assert.equal(body(responses[2].result).facts[0].excerpts[0].text, 'source line');
});
