/**
 * index.ts — Electron main process entry point.
 *
 * Lifecycle:
 *   1. Acquire single-instance lock (second instance quits).
 *   2. Show splash screen.
 *   3. Start hub (ephemeral ports) → parse readiness JSON.
 *   4. Start AI server (ephemeral port, pointed at hub) → parse readiness.
 *   5. Build native menu.
 *   6. Create main window, load renderer with port query params.
 *   7. Close splash, show main window.
 *   8. Silent update check after 5 s.
 *   9. First-launch telemetry consent dialog (once).
 *  10. On quit: tree-kill all child processes.
 */
import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import { execSync } from 'node:child_process';
import { IS_DEV, IS_MAC, IS_WIN, APP_VERSION } from './constants';
import { mainLog, LOG_DIR } from './logger';
import { installCrashHandlers, openBugReport } from './reporter';
import { startHub, startAiServer, stopAll,
         type HubPorts, type AiPorts } from './servers';
import { findPython } from './servers';
import { showSplash } from './splash';
import { createMainWindow, getMainWindow } from './window';
import { buildMenu } from './menu';
import { checkForUpdates } from './updater';
import { showConsentDialog, getConsent, isConsentGranted } from './telemetry';

// ── Crash handlers (before anything else) ─────────────────────────────
installCrashHandlers();

// ── Single instance lock ──────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// ── Server ports (shared with renderer via IPC) ───────────────────────
let ports: { hubHttp: number; hubWs: number; ai: number } | null = null;

// ── IPC handlers ──────────────────────────────────────────────────────
ipcMain.handle('app:version', () => APP_VERSION);
ipcMain.handle('servers:ports', () => ports);
ipcMain.handle('telemetry:consent', () => getConsent());
ipcMain.handle('telemetry:isEnabled', () => isConsentGranted());
ipcMain.on('updater:check', () => checkForUpdates(true));
ipcMain.on('bug:report', () => openBugReport());
ipcMain.on('logs:open', () => shell.openPath(LOG_DIR));

// ── Native dialog handlers ───────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const result = await dialog.showOpenDialog({
    ...(win ? { parentWindow: win } : {}),
    title: 'Open Project Folder',
    properties: ['openDirectory'],
    buttonLabel: 'Open Project',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:openFile', async () => {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const result = await dialog.showOpenDialog({
    ...(win ? { parentWindow: win } : {}),
    title: 'Open File',
    properties: ['openFile'],
    filters: [
      { name: 'Python', extensions: ['py'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── Python availability check ────────────────────────────────────────
ipcMain.handle('system:checkPython', async () => {
  const pyCmd = findPython();
  try {
    const raw = execSync(`${pyCmd} --version`, {
      encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const version = raw.replace(/^Python\s*/i, '');
    return { available: true, version, path: pyCmd };
  } catch {
    return { available: false, version: null, path: null };
  }
});

// ── App ready ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  mainLog.info(`ProofGraph v${APP_VERSION} starting (dev=${IS_DEV})`);

  const splash = showSplash();

  try {
    // 1. Hub server
    splash.setText('Starting analysis hub…');
    const hub: HubPorts = await startHub();

    // 2. AI server (needs hub port)
    splash.setText('Starting AI server…');
    const ai: AiPorts = await startAiServer(hub.httpPort);

    ports = { hubHttp: hub.httpPort, hubWs: hub.wsPort, ai: ai.port };

    // 3. Menu
    buildMenu();

    // 4. Main window
    splash.setText('Loading interface…');
    createMainWindow(hub, ai);

    // 5. Done
    splash.close();
    mainLog.info('startup complete');

    // 6. Silent update check
    if (!IS_DEV) {
      setTimeout(() => checkForUpdates(false), 5_000);
    }

    // 7. First-launch telemetry consent (non-blocking, after window shows)
    if (getConsent() === 'unset') {
      // Small delay so the main window is visible first.
      setTimeout(() => showConsentDialog(), 2_000);
    }

  } catch (err: unknown) {
    splash.close();
    mainLog.error('startup failed', err);
    await dialog.showMessageBox({
      type: 'error',
      title: 'ProofGraph — Startup Failed',
      message: 'Could not start the application.',
      detail: err instanceof Error ? err.message : String(err),
      buttons: ['Quit'],
    });
    app.quit();
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  // macOS: keep running until explicit Cmd+Q
  if (!IS_MAC) app.quit();
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (getMainWindow() === null && ports) {
    createMainWindow(
      { httpPort: ports.hubHttp, wsPort: ports.hubWs },
      { port: ports.ai },
    );
  }
});

app.on('before-quit', () => {
  mainLog.info('quitting — stopping servers');
  stopAll();
});
