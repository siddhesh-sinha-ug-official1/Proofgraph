/**
 * preload/index.ts — secure bridge between main and renderer.
 *
 * Exposes a minimal API on window.proofgraph via contextBridge.
 * The renderer is sandboxed (contextIsolation: true, nodeIntegration: false),
 * so this is the ONLY way it can talk to the main process.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('proofgraph', {
  // ── App info ────────────────────────────────────────────────────────
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:version'),
  getPlatform: (): string =>
    process.platform,

  // ── Server status ───────────────────────────────────────────────────
  getServerPorts: (): Promise<{ hubHttp: number; hubWs: number; ai: number }> =>
    ipcRenderer.invoke('servers:ports'),

  // ── Updates ─────────────────────────────────────────────────────────
  checkForUpdates: (): void =>
    ipcRenderer.send('updater:check'),

  // ── Bug reporting ───────────────────────────────────────────────────
  reportBug: (): void =>
    ipcRenderer.send('bug:report'),
  openLogs: (): void =>
    ipcRenderer.send('logs:open'),
});
