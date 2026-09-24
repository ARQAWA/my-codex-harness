#!/usr/bin/env node
'use strict';

const cp = require('node:child_process');
const { fail, parseRoot, validateScopes } = require('./root-guard.cjs');

function parsePreArgs(tokens) {
  const errors = [];
  let pattern;
  let lang;
  let json;
  let i = 0;
  const takeValue = (token, name) => {
    const eq = token.indexOf('=');
    if (eq !== -1) return token.slice(eq + 1);
    if (i + 1 >= tokens.length) { errors.push(`missing value for ${name}`); return undefined; }
    i += 1;
    return tokens[i];
  };
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || !token.startsWith('-')) { errors.push(`bare token before --: ${token}`); i += 1; continue; }
    if (token === '--pattern' || token.startsWith('--pattern=')) { pattern = takeValue(token, '--pattern'); i += 1; continue; }
    if (token === '--lang' || token.startsWith('--lang=')) { lang = takeValue(token, '--lang'); i += 1; continue; }
    if (token === '--json' || token.startsWith('--json=')) { json = token; i += 1; continue; }
    errors.push(`unsupported or invalid option: ${token}`);
    i += 1;
  }
  if (pattern === undefined) errors.push('--pattern is required');
  if (lang === undefined) errors.push('--lang is required');
  return { pattern, lang, json, errors };
}

(() => {
  try {
    const [, , rootArg, ...argv] = process.argv;
    const root = parseRoot(rootArg);
    const delimiter = argv.indexOf('--');
    if (delimiter < 0) fail('mandatory -- delimiter is missing');
    const { pattern, lang, json, errors } = parsePreArgs(argv.slice(0, delimiter));
    if (errors.length) fail(errors.join('; '));
    const scopes = validateScopes(root, argv.slice(delimiter + 1));
    const args = ['--pattern', pattern, '--lang', lang];
    if (json) args.push(json);
    args.push('--', ...scopes);
    const result = cp.spawnSync('ast-grep', args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    if (result.error) { console.error(`ast-grep unavailable: ${result.error.message}`); process.exitCode = 2; return; }
    process.exitCode = result.status == null ? 2 : result.status;
  } catch (error) {
    if (error.message !== '__wrapper_exit__') { console.error(error.message); process.exitCode = 2; }
  }
})();
