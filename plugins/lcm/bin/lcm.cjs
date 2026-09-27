#!/usr/bin/env node
'use strict';

const archive = require('../lib/archive.cjs');

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['search', 'expand'].includes(command) || args.length === 0) {
    process.stderr.write('Usage: node bin/lcm.cjs search <query> [--offset N] | expand <id>\n');
    process.exitCode = 2;
    return;
  }
  const db = archive.openArchive();
  try {
    if (command === 'search') {
      let offset = 0;
      const option = args.indexOf('--offset');
      if (option >= 0) {
        if (option !== args.length - 2 || !/^\d+$/.test(args[option + 1])) {
          throw new Error('search requires --offset followed by a nonnegative integer');
        }
        offset = Number(args[option + 1]);
        if (!Number.isSafeInteger(offset)) throw new Error('search offset is too large');
        args.splice(option, 2);
      }
      const { rows, nextOffset } = archive.search(db, args.join(' '), offset);
      if (!rows.length) process.stdout.write('No matching archived summaries or records.\n');
      else for (const row of rows) {
        process.stdout.write(`${row.type}\t${row.id}\t${row.session_id}\t${row.snippet}\n`);
      }
      if (nextOffset !== null) process.stdout.write(`Next page: --offset ${nextOffset}\n`);
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
