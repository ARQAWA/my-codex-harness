'use strict';

const path = require('node:path');
const archive = require('../lib/archive.cjs');
const { summarize } = require('../lib/summarize.cjs');

function readInput() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(input || '{}')); }
      catch { reject(new Error('invalid hook JSON input')); }
    });
    process.stdin.on('error', reject);
  });
}

function isChild(input) {
  return typeof input.agent_id === 'string' && input.agent_id.length > 0 ||
    typeof input.agent_type === 'string' && input.agent_type.length > 0;
}

function report(error) {
  // Hook errors do not stop Codex's native compaction. Never print archive data.
  process.stderr.write(`[lcm] ${error instanceof Error ? error.message : 'unknown error'}\n`);
}

async function preCompact() {
  let db;
  try {
    const input = await readInput();
    if (input.hook_event_name !== 'PreCompact' || isChild(input)) return;
    if (typeof input.session_id !== 'string' || !input.session_id ||
        typeof input.transcript_path !== 'string' || !input.transcript_path) {
      throw new Error('root PreCompact has no session ID or transcript path');
    }
    db = archive.openArchive();
    archive.ingestTranscript(db, input.session_id, input.transcript_path);
    const deadline = Date.now() + 105000;
    while (deadline - Date.now() > 12000) {
      const rows = archive.pendingSourceChunk(db, input.session_id);
      if (!rows.length) break;
      const source = rows.map(row => `[${row.id}] ${row.role}\n${archive.boundedSourceText(row.search_text)}`).join('\n\n');
      const summary = await summarize(source, 'leaf', Math.min(45000, deadline - Date.now() - 5000));
      archive.createLeaf(db, input.session_id, rows, summary);
    }
    const children = archive.condensationCandidates(db, input.session_id);
    if (children.length && deadline - Date.now() > 12000) {
      const source = children.map(row => `[${row.id}]\n${row.content}`).join('\n\n');
      const summary = await summarize(source, 'condensed', Math.min(45000, deadline - Date.now() - 5000));
      archive.createParent(db, input.session_id, children, summary);
    }
    if (archive.pendingSourceChunk(db, input.session_id).length) {
      process.stderr.write('[lcm] original records archived; some summaries remain pending\n');
    }
  } catch (error) {
    report(error);
  } finally {
    db?.close();
  }
}

async function sessionStart() {
  let db;
  try {
    const input = await readInput();
    if (input.hook_event_name !== 'SessionStart' || input.source !== 'compact' ||
        typeof input.session_id !== 'string' || !input.session_id) return;
    db = archive.openArchive();
    const cli = path.join(process.env.PLUGIN_ROOT || path.join(__dirname, '..'), 'bin', 'lcm.cjs');
    const context = archive.contextForSession(db, input.session_id, cli);
    if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'SessionStart', additionalContext: context,
    } }));
  } catch (error) {
    report(error);
  } finally {
    db?.close();
  }
}

module.exports = { preCompact, sessionStart };
