/**
 * App-shell round — preferences + recents, persisted in localStorage under
 * VERSIONED keys (APP-SHELL-CONTRACT: Preferences dialog; Recents in File).
 *
 * Honesty rules applied here:
 *  - every preference change is PROBED on the shell log (shell.pref.change);
 *  - a corrupt/absent stored blob falls back to defaults LOUDLY
 *    (shell.pref.load.reset probed, never a silent half-parse);
 *  - the theme default respects prefers-color-scheme (contract) — the source
 *    of the default is recorded in the probe payload.
 */

import { probeShell } from "./shellLog";

export const PREFS_KEY = "pgshell.prefs.v1";
export const RECENTS_KEY = "pgshell.recents.v1";
export const RECENTS_BOUND = 8;

export interface Prefs {
  /** chrome theme; Monaco keeps the CELL's own darcula theme (cell-owned, not overridden) */
  theme: "light" | "dark";
  editorFontSize: number;
  /** graph light-node cap — maps to the graph wall's PROBED capConfig.maxNodes; null = cell default */
  graphMaxNodes: number | null;
  autoReanalyzeOnSave: boolean;
  /** config of the /analyze re-run — pyright resolution mode (declared, never inferred) */
  pyrightMode: "live" | "none";
  /** UI-1C: free accent hex — drives --acc ONLY; verdict fills stay canonical (never themed) */
  accentColor: string;
}

/** UI-1C design tokens: the Settings › Editor·Font stepper bounds (10–18px). */
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 18;

export const ACCENT_DEFAULT = "#7C6FD4";
export const ACCENT_SWATCHES = ["#7C6FD4", "#3574D4", "#2FA080", "#D4703A"] as const;

export function isAccentHex(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function accentAlpha(hex: string, alpha: number): string {
  const ok = isAccentHex(hex) ? hex : ACCENT_DEFAULT;
  const r = parseInt(ok.slice(1, 3), 16), g = parseInt(ok.slice(3, 5), 16), b = parseInt(ok.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Selection tint = accent @ 15% (light) / 28% (dark) — computed, never a
 *  second stored color (the accent is the ONLY free color). */
export function accentTint(hex: string, theme: "light" | "dark"): string {
  return accentAlpha(hex, theme === "dark" ? 0.28 : 0.15);
}

/** Editor line-highlight tint = accent @ 12% (light) / 17% (dark) — token table. */
export function accentLineTint(hex: string, theme: "light" | "dark"): string {
  return accentAlpha(hex, theme === "dark" ? 0.17 : 0.12);
}

/** prefers-color-scheme is the DEFAULT only — a stored pref always wins. */
export function systemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch { /* jsdom without matchMedia impl */ }
  }
  return "dark";
}

export function defaultPrefs(): Prefs {
  return {
    theme: systemTheme(),
    editorFontSize: 13,
    graphMaxNodes: null,
    autoReanalyzeOnSave: false,
    pyrightMode: "none",
    accentColor: ACCENT_DEFAULT,
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadPrefs(): Prefs {
  const s = storage();
  const defaults = defaultPrefs();
  if (s === null) return defaults;
  const raw = s.getItem(PREFS_KEY);
  if (raw === null) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const merged: Prefs = {
      theme: parsed.theme === "light" || parsed.theme === "dark" ? parsed.theme : defaults.theme,
      editorFontSize: typeof parsed.editorFontSize === "number"
        ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(parsed.editorFontSize)))
        : defaults.editorFontSize,
      graphMaxNodes: typeof parsed.graphMaxNodes === "number" && parsed.graphMaxNodes > 0
        ? Math.round(parsed.graphMaxNodes)
        : null,
      autoReanalyzeOnSave: typeof parsed.autoReanalyzeOnSave === "boolean"
        ? parsed.autoReanalyzeOnSave
        : defaults.autoReanalyzeOnSave,
      pyrightMode: parsed.pyrightMode === "live" || parsed.pyrightMode === "none"
        ? parsed.pyrightMode
        : defaults.pyrightMode,
      accentColor: isAccentHex(parsed.accentColor) ? parsed.accentColor : defaults.accentColor,
    };
    return merged;
  } catch {
    probeShell("shell.pref.load.reset", {
      key: PREFS_KEY,
      reason: "stored prefs blob unparseable — falling back to defaults (loud, never a half-parse)",
    });
    return defaults;
  }
}

/** Persist + probe ONE preference change (the contract's "every preference
 *  change probed on the app's own log"). Returns the new prefs object. */
export function setPref<K extends keyof Prefs>(prefs: Prefs, key: K, value: Prefs[K]): Prefs {
  const next = { ...prefs, [key]: value };
  const s = storage();
  if (s !== null) s.setItem(PREFS_KEY, JSON.stringify(next));
  probeShell("shell.pref.change", {
    key, from: prefs[key] as unknown, to: value as unknown,
    persistedKey: PREFS_KEY, persisted: s !== null,
  });
  return next;
}

// ── recents (File menu; localStorage, versioned, tail-bounded) ───────────────

export interface RecentEntry {
  kind: "file" | "folder";
  path: string; // workspace-relative
  t: number;
}

export function loadRecents(): RecentEntry[] {
  const s = storage();
  if (s === null) return [];
  const raw = s.getItem(RECENTS_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is RecentEntry =>
      typeof r === "object" && r !== null &&
      (r.kind === "file" || r.kind === "folder") && typeof r.path === "string");
  } catch {
    probeShell("shell.recents.load.reset", { key: RECENTS_KEY, reason: "unparseable — reset to empty (loud)" });
    return [];
  }
}

export function addRecent(recents: RecentEntry[], kind: RecentEntry["kind"], path: string): RecentEntry[] {
  const next = [{ kind, path, t: Date.now() }, ...recents.filter((r) => !(r.kind === kind && r.path === path))]
    .slice(0, RECENTS_BOUND);
  const s = storage();
  if (s !== null) s.setItem(RECENTS_KEY, JSON.stringify(next));
  probeShell("shell.recents.add", { kind, path, count: next.length, bound: RECENTS_BOUND });
  return next;
}
