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

  // ── Native dialogs (Electron-only — the browser never touches disk) ─
  openFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFolder'),
  openFileDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  // ── Menu → renderer IPC ─────────────────────────────────────────────
  // The main process sends menu actions; the renderer subscribes once.
  onMenuAction: (callback: (action: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) =>
      callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => { ipcRenderer.removeListener('menu:action', handler); };
  },

  // ── Python check ────────────────────────────────────────────────────
  checkPython: (): Promise<{ available: boolean; version: string | null; path: string | null }> =>
    ipcRenderer.invoke('system:checkPython'),

  // ── Updates ─────────────────────────────────────────────────────────
  checkForUpdates: (): void =>
    ipcRenderer.send('updater:check'),

  // ── Bug reporting ───────────────────────────────────────────────────
  reportBug: (): void =>
    ipcRenderer.send('bug:report'),
  openLogs: (): void =>
    ipcRenderer.send('logs:open'),

  // ── Telemetry / privacy ────────────────────────────────────────────
  getTelemetryConsent: (): Promise<string> =>
    ipcRenderer.invoke('telemetry:consent'),
  isTelemetryEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('telemetry:isEnabled'),
});
