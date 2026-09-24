// Test-only CLI double: production code never reads these fixture variables.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const original = cp.execFile;
cp.execFile = function (exe, args, options, callback) {
  if (exe !== 'codebase-memory-mcp') return original.apply(this, arguments);
  const child = new EventEmitter();
  child.kill = () => {};
  const state = process.env.FSSEARCH_FIXTURE_STATE;
  const graphFile = path.join(state, 'graph.json');
  const log = path.join(state, 'calls.jsonl');
  const tool = args[1];
  const root = options.cwd;
  const graph = fs.existsSync(graphFile) ? JSON.parse(fs.readFileSync(graphFile, 'utf8')) : null;
  const reply = value => callback(null, JSON.stringify(value), '');
  if (tool === 'index_repository') {
    if (args[args.indexOf('--repo-path') + 1] !== root || args[args.indexOf('--mode') + 1] !== 'full') throw new Error('wrong index contract');
    const snapshot = fs.readFileSync(path.join(root, 'probe.py'), 'utf8');
    fs.appendFileSync(log, JSON.stringify({ event: 'start', snapshot }) + '\n');
    setTimeout(() => {
      if (fs.existsSync(path.join(state, 'fail'))) {
        const error = new Error('injected index failure'); error.code = 1;
        callback(error, '', error.message); return;
      }
      fs.writeFileSync(graphFile, JSON.stringify({ root, snapshot }));
      fs.appendFileSync(log, JSON.stringify({ event: 'finish', snapshot }) + '\n');
      reply({ project: 'fixture-project', status: 'indexed' });
    }, 400);
  } else if (tool === 'list_projects') {
    setImmediate(() => reply({ projects: graph ? [{ name: 'fixture-project', root_path: graph.root }] : [], has_more: false }));
  } else {
    if (args[2] !== '--project' || args[3] !== 'fixture-project') throw new Error('project identity not injected');
    setImmediate(() => reply({ snapshot: graph?.snapshot }));
  }
  return child;
};
