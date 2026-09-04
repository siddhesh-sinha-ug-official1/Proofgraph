/**
 * store.ts — lightweight JSON settings store.
 *
 * Persists window bounds and user preferences to a single file
 * in the user-data directory.  No external dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { USER_DATA_DIR } from './constants';

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
  cache = s;
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tmp = STORE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf-8');
  fs.renameSync(tmp, STORE_PATH);               // atomic on all platforms
}

// ── Public API ────────────────────────────────────────────────────────
export function get<K extends keyof Settings>(key: K): Settings[K] {
  return load()[key];
}

export function set<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): void {
  const s = load();
  s[key] = value;
  persist(s);
}
