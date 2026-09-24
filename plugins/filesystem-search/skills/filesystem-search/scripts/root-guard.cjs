'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function canon(p) {
  let real;
  try {
    real = fs.realpathSync.native(p);
  } catch {
    return process.platform === 'win32' ? String(p).toLowerCase() : String(p);
  }
  if (process.platform === 'win32') return real.toLowerCase();
  return real;
}

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function fail(message, code = 2) {
  console.error(message);
  process.exitCode = code;
  throw new Error('__wrapper_exit__');
}

function isAllowedRoot(root) {
  const fsRoot = path.parse(root).root;
  if (root === canon(os.homedir())) return false;
  if (root === canon(codexHome())) return false;
  if (root === fsRoot) return false;
  return true;
}

function parseRoot(rootArg) {
  if (!rootArg || !path.isAbsolute(rootArg)) fail('root must be an absolute path');
  let stat;
  try { stat = fs.statSync(rootArg); } catch { fail('root must exist and be a directory'); }
  if (!stat.isDirectory()) fail('root must be an existing directory');
  let rp;
  try { rp = fs.realpathSync.native(rootArg); } catch { fail('root cannot be canonicalized'); }
  const crp = canon(rp);
  const sessionRoot = process.env.FSSEARCH_SESSION_ROOT;
  if (!sessionRoot || !path.isAbsolute(sessionRoot) || !fs.existsSync(sessionRoot)
      || !isAllowedRoot(crp) || crp !== canon(sessionRoot)) {
    fail('root must be the current project root (session cwd from FSSEARCH_SESSION_ROOT)', 2);
  }
  return rp;
}

function validateScopes(root, scopes) {
  if (!scopes.length) fail('at least one explicit scope is required');
  return scopes.map((scope) => {
    if (!scope || path.isAbsolute(scope) || scope.split(/[\\/]/).includes('..') || scope.includes('\0')) fail(`invalid scope: ${scope}`);
    const candidate = scope === '.' ? root : `${root}${path.sep}${scope}`;
    let real;
    try { real = fs.realpathSync.native(candidate); } catch { fail(`scope does not exist: ${scope}`); }
    const rel = path.relative(root, real);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail(`scope escapes root: ${scope}`);
    return rel || '.';
  });
}

module.exports = { canon, codexHome, fail, isAllowedRoot, parseRoot, validateScopes };
