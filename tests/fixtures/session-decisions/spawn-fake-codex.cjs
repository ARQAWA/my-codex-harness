'use strict';

// Test-only preload (node --require): a spawnSync of the fake codex path runs fake-codex.mjs with this Node, so no
// shell script or executable bit is needed on any platform. argv, input and options are forwarded unchanged, so the
// fake still records what the recorder really sent. Production code never loads this file.
const childProcess = require('node:child_process');

const realSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = (file, args, options) => {
  const script = process.env.FAKE_CODEX_SCRIPT;
  if (script && file === process.env.CODEX_EXECUTABLE) {
    return realSpawnSync(process.execPath, [script, ...(args ?? [])], options);
  }
  return realSpawnSync(file, args, options);
};
