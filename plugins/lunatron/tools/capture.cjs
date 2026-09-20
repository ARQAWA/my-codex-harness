'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function writeResult(result, failed = false) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (failed) process.exitCode = 1;
}

function readRequest() {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid capture request JSON: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['executable', 'argv', 'cwd'].includes(key))) {
    throw new Error('Capture request must contain only executable, argv, and cwd');
  }
  if (typeof value.executable !== 'string' || value.executable.length === 0) {
    throw new Error('Capture request executable must be a nonempty string');
  }
  if (!Array.isArray(value.argv) || value.argv.some(argument => typeof argument !== 'string')) {
    throw new Error('Capture request argv must be an array of strings');
  }
  if (typeof value.cwd !== 'string' || value.cwd.length === 0) {
    throw new Error('Capture request cwd must be a nonempty string');
  }
  const pluginData = process.env.PLUGIN_DATA;
  if (typeof pluginData !== 'string' || pluginData.length === 0) {
    throw new Error('PLUGIN_DATA is required for capture output');
  }
  return { ...value, pluginData: path.resolve(pluginData) };
}

function streamCompletion(stream, state) {
  if (state.finished || state.error) return Promise.resolve();
  return new Promise(resolve => {
    stream.once('finish', () => {
      state.finished = true;
      resolve();
    });
    stream.once('error', error => {
      state.error = error;
      resolve();
    });
  });
}

async function capture(request) {
  const capturesDirectory = path.join(request.pluginData, 'captures');
  fs.mkdirSync(capturesDirectory, { recursive: true });
  const runDirectory = fs.mkdtempSync(path.join(capturesDirectory, 'run-'));
  const stdoutPath = path.resolve(runDirectory, 'stdout.txt');
  const stderrPath = path.resolve(runDirectory, 'stderr.txt');
  const stdoutFile = fs.createWriteStream(stdoutPath, { flags: 'wx' });
  const stderrFile = fs.createWriteStream(stderrPath, { flags: 'wx' });
  const streams = {
    stdout: { file: stdoutFile, bytes: 0, error: null, finished: false },
    stderr: { file: stderrFile, bytes: 0, error: null, finished: false },
  };
  const stdoutDone = streamCompletion(stdoutFile, streams.stdout);
  const stderrDone = streamCompletion(stderrFile, streams.stderr);

  let child;
  let launchError = null;
  try {
    child = spawn(request.executable, request.argv, {
      cwd: request.cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    launchError = error;
  }

  if (child) {
    child.stdout.on('data', chunk => { streams.stdout.bytes += chunk.length; });
    child.stderr.on('data', chunk => { streams.stderr.bytes += chunk.length; });
    child.stdout.pipe(stdoutFile);
    child.stderr.pipe(stderrFile);

    const onWriteError = error => {
      if (!streams.stdout.error && !streams.stderr.error) {
        streams.stdout.error = error;
        streams.stderr.error = error;
      }
      if (!child.killed) child.kill('SIGTERM');
    };
    stdoutFile.once('error', onWriteError);
    stderrFile.once('error', onWriteError);
  }

  let exitCode = null;
  let signal = null;
  if (child) {
    ({ code: exitCode, signal } = await new Promise(resolve => {
      let launchReported = false;
      child.once('error', error => {
        launchError = error;
        launchReported = true;
      });
      child.once('close', (code, closedSignal) => {
        resolve({ code, signal: closedSignal, launchReported });
      });
    }));
  }

  if (!child) {
    stdoutFile.end();
    stderrFile.end();
  }
  await Promise.all([stdoutDone, stderrDone]);

  const writeError = streams.stdout.error || streams.stderr.error;
  const complete = Boolean(child && !launchError && !writeError
    && !streams.stdout.error && !streams.stderr.error);
  const result = {
    status: launchError ? 'launch_error' : writeError ? 'write_error' : complete ? 'completed' : 'incomplete',
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
    stdout_bytes: streams.stdout.bytes,
    stderr_bytes: streams.stderr.bytes,
    completeness: {
      stdout: complete,
      stderr: complete,
      overall: complete,
    },
    exit_code: exitCode,
    signal,
  };
  if (launchError) result.error = { type: 'launch', message: launchError.message };
  else if (writeError) result.error = { type: 'write', message: writeError.message };
  else if (!complete) result.error = { type: 'incomplete', message: 'Process output was not fully captured' };
  return { result, failed: !complete };
}

(async () => {
  try {
    const request = readRequest();
    const { result, failed } = await capture(request);
    writeResult(result, failed);
  } catch (error) {
    writeResult({
      status: 'launch_error',
      completeness: { stdout: false, stderr: false, overall: false },
      error: { type: 'launch', message: error.message },
    }, true);
  }
})();
