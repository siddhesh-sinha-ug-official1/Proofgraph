/**
 * servers.ts — hub + AI server process lifecycle.
 *
 * Each server is started with ephemeral ports (--port 0) and reports
 * its actual ports via a single-line JSON on stdout:
 *   {"ready": true, "httpPort": N, "wsPort": M, ...}
 *
 * On failure the line carries {"ready": false, "detail": "..."} and
 * the process exits 2.
 *
 * Tree-kill follows the audited pattern from the debug pass:
 *   POSIX  — detached: true  → process.kill(-pid, SIGTERM), wait 5 s,
 *            then SIGKILL to the group, then the direct child.
 *   Windows — taskkill /PID /T /F (recursive tree-kill via OS).
 */
import { ChildProcess, spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { IS_DEV, IS_WIN, ROOT_DIR,
         HUB_STARTUP_TIMEOUT, AI_STARTUP_TIMEOUT } from './constants';
import { hubLog, aiLog } from './logger';
import type { Logger } from 'electron-log';

// ── State ─────────────────────────────────────────────────────────────
let hubProc:  ChildProcess | null = null;
let aiProc:   ChildProcess | null = null;

export interface HubPorts  { httpPort: number; wsPort: number }
export interface AiPorts   { port: number }

// ── Python resolution ─────────────────────────────────────────────────
function findPython(): string {
  return process.env.PYTHON ?? (IS_WIN ? 'python' : 'python3');
}

// ── Readiness parser ──────────────────────────────────────────────────
function tryParseJson(line: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(line.trim());
    return typeof o === 'object' && o !== null ? o : null;
  } catch { return null; }
}

function waitForReadiness(
  proc: ChildProcess,
  name: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buf = '';

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${name} did not become ready within ${timeoutMs / 1000}s`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      proc.stdout?.removeListener('data', onData);
      proc.removeListener('exit', onExit);
    }

    function onData(chunk: Buffer) {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const obj = tryParseJson(line);
        if (obj && 'ready' in obj) {
          cleanup();
          if (obj.ready) resolve(obj);
          else reject(new Error(
            `${name} startup failed: ${obj.detail ?? obj.failureClass ?? 'unknown'}`,
          ));
          return;
        }
      }
    }

    function onExit(code: number | null) {
      cleanup();
      reject(new Error(`${name} exited (code ${code}) before reporting ready`));
    }

    proc.stdout?.on('data', onData);
    proc.on('exit', onExit);
  });
}

// ── Stderr pipe ───────────────────────────────────────────────────────
function pipeStderr(proc: ChildProcess, log: Logger) {
  proc.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) log.debug(line);
    }
  });
}

// ── Start hub ─────────────────────────────────────────────────────────
export async function startHub(): Promise<HubPorts> {
  const log = hubLog;
  let cmd: string;
  let args: string[];

  if (IS_DEV) {
    cmd = findPython();
    args = [
      path.join(ROOT_DIR, 'hub', 'serve_app.py'),
      '--http-port', '0', '--ws-port', '0',
    ];
  } else {
    // Production: frozen PyInstaller executable in resources/hub/
    cmd = IS_WIN
      ? path.join(ROOT_DIR, 'hub', 'serve_app', 'serve_app.exe')
      : path.join(ROOT_DIR, 'hub', 'serve_app', 'serve_app');
    args = ['--http-port', '0', '--ws-port', '0'];
  }

  log.info(`spawn: ${cmd} ${args.join(' ')}`);
  const proc = spawn(cmd, args, {
    cwd: IS_DEV ? ROOT_DIR : undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !IS_WIN,
    windowsHide: true,
  });
  hubProc = proc;
  pipeStderr(proc, log);

  const r = await waitForReadiness(proc, 'hub', HUB_STARTUP_TIMEOUT);
  const ports: HubPorts = {
    httpPort: r.httpPort as number,
    wsPort:   r.wsPort  as number,
  };
  log.info(`hub ready — HTTP :${ports.httpPort}  WS :${ports.wsPort}`);
  return ports;
}

// ── Start AI server ───────────────────────────────────────────────────
export async function startAiServer(hubHttpPort: number): Promise<AiPorts> {
  const log = aiLog;
  let cmd: string;
  let args: string[];

  const hubFlag = `http://127.0.0.1:${hubHttpPort}`;

  if (IS_DEV) {
    cmd = 'node';
    args = [
      path.join(ROOT_DIR, 'ai', 'server.ts'),
      '--port', '0', '--hub', hubFlag,
    ];
  } else {
    // Production: bundled JS file, run on Electron's Node via fork.
    // We use child_process.spawn with the same executable because
    // utilityProcess is Electron ≥28 only and has IPC quirks.
    // Electron's node can run plain JS when invoked as a child.
    cmd = process.execPath;
    args = [
      path.join(ROOT_DIR, 'ai-server.cjs'),
      '--port', '0', '--hub', hubFlag,
    ];
  }

  log.info(`spawn: ${cmd} ${args.join(' ')}`);
  const proc = spawn(cmd, args, {
    cwd: IS_DEV ? ROOT_DIR : undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !IS_WIN,
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  aiProc = proc;
  pipeStderr(proc, log);

  const r = await waitForReadiness(proc, 'ai-server', AI_STARTUP_TIMEOUT);
  const ports: AiPorts = { port: r.port as number };
  log.info(`ai-server ready — port :${ports.port}`);
  return ports;
}

// ── Tree-kill (matches audited pattern from debug pass) ───────────────
function treeKill(proc: ChildProcess | null): void {
  if (!proc || !proc.pid || proc.exitCode !== null) return;
  const pid = proc.pid;

  if (IS_WIN) {
    try {
      execSync(`taskkill /PID ${pid} /T /F`,
        { stdio: 'ignore', timeout: 10_000 });
    } catch { /* already dead */ }
    return;
  }

  // POSIX: SIGTERM the process group, wait 5 s, then SIGKILL.
  try { process.kill(-pid, 'SIGTERM'); } catch { /* already dead */ }

  setTimeout(() => {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* already dead */ }
    try { proc.kill('SIGKILL'); }         catch { /* already dead */ }
  }, 5_000);
}

// ── Graceful shutdown ─────────────────────────────────────────────────
export function stopAll(): void {
  hubLog.info('stopping hub');
  treeKill(hubProc);
  hubProc = null;

  aiLog.info('stopping ai-server');
  treeKill(aiProc);
  aiProc = null;
}
