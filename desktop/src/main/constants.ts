/**
 * constants.ts — shared values for the Electron main process.
 *
 * Platform flags, paths, GitHub coordinates, and startup timeouts.
 * Imported by every other module; must not import from them.
 */
import { app } from 'electron';
import path from 'node:path';

// ── Platform ──────────────────────────────────────────────────────────
export const IS_DEV = !app.isPackaged;
export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

// ── Identity ──────────────────────────────────────────────────────────
export const APP_NAME = 'ProofGraph';
export const APP_VERSION: string = app.getVersion();

export const GITHUB_OWNER = 'siddhesh-sinha-ug-official1';
export const GITHUB_REPO = 'Proofgraph';
export const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const ISSUES_URL = `${GITHUB_URL}/issues/new`;

// ── Paths ─────────────────────────────────────────────────────────────
/**
 * In dev mode: the repo root (three levels above dist/main/).
 * In production: process.resourcesPath (where extraResources land).
 */
export const ROOT_DIR = IS_DEV
  ? path.resolve(__dirname, '..', '..', '..')
  : process.resourcesPath;

export const USER_DATA_DIR: string = app.getPath('userData');
export const LOGS_DIR: string = app.getPath('logs');

// ── Server startup timeouts (ms) ─────────────────────────────────────
/** Hub may run a full pipeline on first start — allow 60 s. */
export const HUB_STARTUP_TIMEOUT = 60_000;
/** AI server is fast (no pipeline) — 15 s is generous. */
export const AI_STARTUP_TIMEOUT = 15_000;
