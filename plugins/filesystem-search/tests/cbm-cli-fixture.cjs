#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.shift() !== 'cli') process.exit(2);
const tool = args.shift();
const value = flag => args[args.indexOf(flag) + 1];
const state = process.env.FSSEARCH_FIXTURE_STATE;
const graphFile = path.join(state, 'graph.json');
const logFile = path.join(state, 'calls.jsonl');
const graph = () => fs.existsSync(graphFile) ? JSON.parse(fs.readFileSync(graphFile, 'utf8')) : null;
const reply = data => { process.stdout.write(JSON.stringify(data)); };
if (tool === 'list_projects') {
  const current = graph();
  reply({ projects: current ? [{ name: 'fixture-project', root_path: current.root }] : [], has_more: false });
} else if (tool === 'index_repository') {
  const root = value('--repo-path');
  if (root !== process.cwd() || value('--mode') !== 'full') process.exit(2);
  const snapshot = fs.readFileSync(path.join(root, 'probe.py'), 'utf8');
  fs.appendFileSync(logFile, JSON.stringify({ event: 'start', snapshot }) + '\n');
  setTimeout(() => {
    if (fs.existsSync(path.join(state, 'fail'))) process.exit(1);
    fs.writeFileSync(graphFile, JSON.stringify({ root, snapshot }));
    fs.appendFileSync(logFile, JSON.stringify({ event: 'finish', snapshot }) + '\n');
    reply({ project: 'fixture-project', status: 'indexed' });
  }, 400);
} else {
  if (value('--project') !== 'fixture-project') process.exit(2);
  reply({ snapshot: graph()?.snapshot });
}
