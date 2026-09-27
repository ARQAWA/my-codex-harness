#!/usr/bin/env node
'use strict';

const archive = require('../lib/archive.cjs');

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['search', 'expand'].includes(command) || args.length === 0) {
    process.stderr.write('Usage: node bin/lcm.cjs search <query> | expand <id>\n');
    process.exitCode = 2;
    return;
  }
  const db = archive.openArchive();
  try {
    if (command === 'search') {
      const rows = archive.search(db, args.join(' '));
      if (!rows.length) process.stdout.write('No matching archived records.\n');
      else for (const row of rows) {
        process.stdout.write(`${row.id}\t${row.session_id}\t${row.role}\t${row.snippet}\n`);
      }
    } else {
      if (args.length !== 1) throw new Error('expand requires exactly one ID');
      const raw = archive.expand(db, args[0]);
      if (raw === null) {
        process.stderr.write(`Archived record not found: ${args[0]}\n`);
        process.exitCode = 1;
      } else process.stdout.write(raw + '\n');
    }
  } finally {
    db.close();
  }
}

try { main(); }
catch (error) {
  process.stderr.write(`[lcm] ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
