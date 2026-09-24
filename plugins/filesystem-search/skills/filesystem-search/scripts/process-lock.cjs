'use strict';

// An OS-backed lock survives neither a crash nor PID reuse. SQLite is built
// into Node; this avoids stale-file takeover races on all three platforms.
function tryLock(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  try {
    db.exec('BEGIN EXCLUSIVE');
    return () => db.close();
  } catch (error) {
    db.close();
    if (/database is locked|database is busy/.test(error.message)) return null;
    throw error;
  }
}

module.exports = { tryLock };
