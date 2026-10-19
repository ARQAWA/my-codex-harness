'use strict';

const { closeSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

// Running subagents of a Main session: one file per agent, created at SubagentStart and removed at SubagentStop.
// One file per agent needs no lock when several agents start or stop at once. The file keeps the agent's rollout
// path: an agent whose rollout already ended its turn counts as stopped even when its SubagentStop never fired,
// such as after an interrupt. A file older than STALE_MS counts as gone, so nothing holds Main forever.
const STALE_MS = 60 * 60 * 1000;
const TAIL_BYTES = 65536;
const ENDED = /"type":"(task_complete|turn_aborted)"/;

const safe = (text) => text.replace(/[^A-Za-z0-9_.-]/g, '_');

function agentsDir(sessionId) {
  return join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'scope-focus-todo', `agents-${safe(sessionId)}`);
}

function markStarted(sessionId, agentId, transcriptPath) {
  const dir = agentsDir(sessionId);
  const text = typeof transcriptPath === 'string' ? transcriptPath : '';
  // A parallel stop or count may remove the empty directory between mkdir and write; create it again and retry.
  for (let attempt = 0; ; attempt += 1) {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, safe(agentId)), text);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT' || attempt >= 4) throw error;
    }
  }
}

// The session directory goes away with its last record, so finished sessions leave nothing behind.
function removeIfEmpty(dir) {
  try {
    rmdirSync(dir);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
  }
}

function markStopped(sessionId, agentId) {
  try {
    unlinkSync(join(agentsDir(sessionId), safe(agentId)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  removeIfEmpty(agentsDir(sessionId));
}

// True when the end of the rollout records a finished or aborted turn.
function rolloutEnded(transcriptPath) {
  if (transcriptPath === '') return false;
  let fd;
  try {
    fd = openSync(transcriptPath, 'r');
    const size = fstatSync(fd).size;
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return ENDED.test(buffer.toString('utf8'));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// A new process of the session, at startup, resume or clear, starts with no running subagents, as omp keeps them in
// process memory: records of a process that ended, such as after a crash, must not hold Main at Stop.
function clearSession(sessionId) {
  rmSync(agentsDir(sessionId), { recursive: true, force: true });
}

// Number of agents still running; stale and ended records are removed on the way.
function runningCount(sessionId) {
  const dir = agentsDir(sessionId);
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  let count = 0;
  for (const name of names) {
    const file = join(dir, name);
    try {
      if (Date.now() - statSync(file).mtimeMs > STALE_MS || rolloutEnded(readFileSync(file, 'utf8'))) unlinkSync(file);
      else count += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (count === 0) removeIfEmpty(dir);
  return count;
}

module.exports = { agentsDir, clearSession, markStarted, markStopped, runningCount, STALE_MS };
