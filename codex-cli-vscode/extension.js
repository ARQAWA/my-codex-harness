'use strict';

const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Константы и пути

const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const PACKAGE = '@openai/codex';
const EXE_REL = path.join('node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'NODE_USE_ENV_PROXY', 'NODE_TLS_REJECT_UNAUTHORIZED'];

// Состояние модуля

let output;
let codexRoot = '';
let npmCli = '';
let ready = Promise.resolve();
let count = 0;
const ptys = new Set();
// версия → число вкладок этого окна, которые её выбрали и ещё не завершились
const live = new Map();

// Кавычки: сначала для bash (одинарные кавычки с '\''), затем для PowerShell (удвоенные ')

function bashQuote(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function psQuote(s) {
  return "'" + s.replace(/'/g, "''") + "'";
}

// Окружение дочерних процессов

function envGet(env, name) {
  return Object.keys(env)
    .filter((k) => k.toUpperCase() === name.toUpperCase())
    .map((k) => env[k])
    .find((v) => v);
}

function envSet(env, name, value) {
  for (const k of Object.keys(env)) {
    if (k.toUpperCase() === name.toUpperCase()) delete env[k];
  }
  env[name] = value;
}

function childEnv() {
  const env = { ...process.env };
  const http = vscode.workspace.getConfiguration('http');
  const proxy = http.get('proxy');
  if (typeof proxy === 'string' && proxy.trim()) {
    const value = proxy.trim();
    envSet(env, 'HTTP_PROXY', value);
    envSet(env, 'HTTPS_PROXY', value);
  }
  if (http.get('proxyStrictSSL') === false) envSet(env, 'NODE_TLS_REJECT_UNAUTHORIZED', '0');
  return env;
}

// Прокси и TLS-настройки из VS Code дополнительно экспортируются прямо в строке bash,
// чтобы login-оболочка Git Bash получила их после своих профильных скриптов.
function proxyExports(env) {
  return PROXY_VARS.filter((name) => envGet(env, name))
    .map((name) => 'export ' + name + '=' + bashQuote(envGet(env, name)) + '; ')
    .join('');
}

// Версии установок Codex

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function exePath(v) {
  return path.join(codexRoot, v, EXE_REL);
}

function installedVersions() {
  let names;
  try {
    names = fs.readdirSync(codexRoot);
  } catch {
    return [];
  }
  return names
    .filter((n) => VERSION_RE.test(n) && fs.existsSync(exePath(n)))
    .sort((a, b) => compareVersions(b, a));
}

function latestVersion() {
  const [v] = installedVersions();
  return v ?? null;
}

function rm(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  } catch {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Команды

function activate(context) {
  codexRoot = path.join(context.extensionPath, 'codex');
  npmCli = path.join(context.extensionPath, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  output = vscode.window.createOutputChannel('ARQAWA CCLI');
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('ccli.newTab', () => openTab('codex ' + ++count, [])),
    vscode.commands.registerCommand('ccli.login', () => openTab('codex login', ['login', '--device-auth'])),
  );
  ready = update();
}

// Установка и обновление Codex через встроенный npm

function runNpm(args, cache) {
  return new Promise((resolve, reject) => {
    output.appendLine('> npm ' + args.join(' '));
    const env = childEnv();
    envSet(env, 'ELECTRON_RUN_AS_NODE', '1');
    const proxyStrictSSL = vscode.workspace.getConfiguration('http').get('proxyStrictSSL');
    const child = cp.spawn(
      process.execPath,
      [npmCli, ...args, '--cache', cache, '--no-audit', '--no-fund', '--no-update-notifier', '--loglevel=error', ...(proxyStrictSSL === false ? ['--strict-ssl=false'] : [])],
      { cwd: codexRoot, env, windowsHide: true },
    );
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      output.append(text);
    });
    child.stderr.on('data', (chunk) => output.append(chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error('npm завершился с кодом ' + code));
      else resolve(stdout);
    });
  });
}

async function install(version, cache) {
  const tmp = path.join(codexRoot, '.tmp-' + process.pid);
  rm(tmp);
  try {
    await runNpm(['install', '--prefix', tmp, PACKAGE + '@' + version], cache);
    if (!fs.existsSync(path.join(tmp, EXE_REL))) throw new Error('в установке нет codex.exe');
    const target = path.join(codexRoot, version);
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        fs.renameSync(tmp, target);
        break;
      } catch (err) {
        // Несколько окон VS Code могут ставить одну версию одновременно: если папка версии уже есть, ошибки нет.
        if (fs.existsSync(exePath(version))) break;
        if (attempt === 5) throw err;
        await sleep(1000);
      }
    }
  } finally {
    rm(tmp);
  }
}

function prune() {
  const versions = installedVersions();
  for (const name of fs.readdirSync(codexRoot)) {
    const p = path.join(codexRoot, name);
    if (name.endsWith('.old')) {
      rm(p);
    } else if (name.startsWith('.') && !name.endsWith('-' + process.pid) && Date.now() - fs.statSync(p).mtimeMs > 3600000) {
      rm(p);
    } else if (VERSION_RE.test(name) && name !== versions[0] && !live.has(name)) {
      // Переименование не проходит, пока запущен codex.exe этой версии: Windows не даёт переименовать занятую папку.
      // Тогда папка остаётся до следующего запуска расширения.
      // Версии, выбранные вкладками этого окна, пропускаются; другие окна VS Code защищены только блокировкой запущенного exe.
      try {
        fs.renameSync(p, p + '.old');
        rm(p + '.old');
      } catch {}
    }
  }
}

async function update() {
  const cache = path.join(codexRoot, '.npm-cache-' + process.pid);
  try {
    fs.mkdirSync(codexRoot, { recursive: true });
    const latest = (await runNpm(['view', PACKAGE, 'version'], cache)).trim();
    if (!VERSION_RE.test(latest)) throw new Error('npm вернул неожиданную версию: ' + latest);
    if (!fs.existsSync(exePath(latest))) {
      const job = install(latest, cache);
      vscode.window.setStatusBarMessage('CCLI: устанавливаю Codex ' + latest, job);
      await job;
    }
  } catch (err) {
    output.appendLine('обновление Codex: ' + err.message);
  } finally {
    rm(cache);
    try {
      prune();
    } catch (err) {
      output.appendLine('очистка старых версий Codex: ' + err.message);
    }
  }
}

// Вкладки терминала

function makePty(nodePty, args) {
  const writeEmitter = new vscode.EventEmitter();
  let proc = null;
  let closed = false;
  let held = null;

  function hold(v) {
    held = v;
    live.set(v, (live.get(v) || 0) + 1);
  }

  function release() {
    if (held === null) return;
    const n = live.get(held) - 1;
    if (n > 0) live.set(held, n);
    else live.delete(held);
    held = null;
    // версия отпущена: убрать устаревшие версии, если она больше не нужна
    try { prune(); } catch {}
  }

  async function start(dims) {
    let version = latestVersion();
    if (!version) {
      writeEmitter.fire('Устанавливаю Codex, это займёт несколько минут...\r\n');
      await ready;
      if (closed) return;
      version = latestVersion();
      if (!version) {
        writeEmitter.fire('Codex не установлен, подробности в выводе «ARQAWA CCLI» (панель Output)\r\n');
        return;
      }
    }
    hold(version);
    const exe = exePath(version);
    const env = childEnv();
    const inner = proxyExports(env) + [exe.replace(/\\/g, '/'), ...args].map(bashQuote).join(' ');
    const command = "& '" + GIT_BASH + "' --login -i -c " + psQuote(inner);
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
    let p;
    try {
      p = nodePty.spawn(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-Command', command],
        {
          name: 'xterm-256color',
          cols: dims?.columns ?? 120,
          rows: dims?.rows ?? 30,
          cwd,
          env,
        },
      );
    } catch (err) {
      writeEmitter.fire(err.message + '\r\n');
      release();
      return;
    }
    proc = p;
    ptys.add(p);
    p.onData((data) => writeEmitter.fire(data));
    p.onExit(({ exitCode }) => {
      ptys.delete(p);
      release();
      if (proc === p) proc = null;
      writeEmitter.fire('\r\n[codex завершился, код ' + exitCode + ']\r\n');
    });
  }

  return {
    onDidWrite: writeEmitter.event,
    open(dims) {
      start(dims).catch((err) => writeEmitter.fire(err.message + '\r\n'));
    },
    handleInput(data) {
      if (proc) proc.write(data);
    },
    setDimensions(d) {
      if (proc) proc.resize(d.columns, d.rows);
    },
    close() {
      closed = true;
      release();
      if (proc) {
        try {
          proc.kill();
        } catch {}
        ptys.delete(proc);
        proc = null;
      }
    },
  };
}

function loadNodePty() {
  const p = path.join(vscode.env.appRoot, 'node_modules.asar', 'node-pty');
  try {
    return require(p);
  } catch (err) {
    throw new Error('В VS Code не найден node-pty (' + p + '): ' + err.message);
  }
}

function openTab(name, args) {
  if (!fs.existsSync(GIT_BASH)) {
    vscode.window.showErrorMessage('Не найден ' + GIT_BASH + '. Установите Git for Windows.');
    return;
  }
  let nodePty;
  try {
    nodePty = loadNodePty();
  } catch (err) {
    vscode.window.showErrorMessage(err.message);
    return;
  }
  const terminal = vscode.window.createTerminal({
    name,
    pty: makePty(nodePty, args),
    location: { viewColumn: vscode.ViewColumn.Active },
  });
  terminal.show();
}

function deactivate() {
  for (const p of [...ptys]) {
    try {
      p.kill();
    } catch {}
  }
}

module.exports = { activate, deactivate };
