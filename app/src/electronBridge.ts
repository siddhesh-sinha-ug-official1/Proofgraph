/**
 * electronBridge.ts — type-safe access to the Electron preload API.
 *
 * When running inside Electron, window.proofgraph is injected by the
 * preload script. In a browser (dev server, acceptance tests), it's
 * undefined. This module provides typed access and graceful fallbacks.
 */

export interface ProofGraphBridge {
  getVersion: () => Promise<string>;
  getPlatform: () => string;
  getServerPorts: () => Promise<{ hubHttp: number; hubWs: number; ai: number }>;
  openFolderDialog: () => Promise<string | null>;
  openFileDialog: () => Promise<string | null>;
  onMenuAction: (callback: (action: string) => void) => () => void;
  checkPython: () => Promise<{ available: boolean; version: string | null; path: string | null }>;
  checkForUpdates: () => void;
  reportBug: () => void;
  openLogs: () => void;
  getTelemetryConsent: () => Promise<string>;
  isTelemetryEnabled: () => Promise<boolean>;
}

declare global {
  interface Window {
    proofgraph?: ProofGraphBridge;
  }
}

/** True when running inside the Electron desktop shell. */
export function isElectron(): boolean {
  return typeof window.proofgraph !== "undefined";
}

/** Get the bridge, or null in browser mode. */
export function getBridge(): ProofGraphBridge | null {
  return window.proofgraph ?? null;
}

/**
 * Show a native folder picker. Returns the selected absolute path,
 * or null if cancelled. Falls back to null in browser mode.
 */
export async function pickFolder(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.openFolderDialog();
}

/**
 * Show a native file picker. Returns the selected absolute path,
 * or null if cancelled. Falls back to null in browser mode.
 */
export async function pickFile(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.openFileDialog();
}
