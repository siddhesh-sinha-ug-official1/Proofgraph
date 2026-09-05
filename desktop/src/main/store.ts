/**
 * store.ts — lightweight JSON settings store.
 *
 * Persists window bounds and user preferences to a single file
 * in the user-data directory.  No external dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { USER_DATA_DIR } from './constants';
import { mainLog } from './logger';

const STORE_PATH = path.join(USER_DATA_DIR, 'settings.json');

// ── Schema ────────────────────────────────────────────────────────────
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  windowBounds?: WindowBounds;
  windowMaximized?: boolean;
  lastFixture?: string;
  checkUpdatesOnStart?: boolean;
}

// ── In-memory cache ───────────────────────────────────────────────────
let cache: Settings | null = null;

// Ensure the settings directory exists exactly once.
let dirCreated = false;

function load(): Settings {
  if (cache !== null) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    return cache!;
  } catch {
    cache = {};
    return cache;
  }
}

function persist(s: Settings): void {
  try {
    if (!dirCreated) {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      dirCreated = true;
    }
    const tmp = STORE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf-8');
    fs.renameSync(tmp, STORE_PATH);
    // Update the cache only AFTER the disk write succeeds, so memory
    // and disk never desynchronize on a write failure.
    cache = s;
  } catch (err) {
    // Log but don't crash — settings are non-critical.
    mainLog.warn('settings persist failed', err);
  }
}

// ── Public API ────────────────────────────────────────────────────────
export function get<K extends keyof Settings>(key: K): Settings[K] {
  return load()[key];
}

export function set<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): void {
  const s = { ...load(), [key]: value };
  persist(s);
}
