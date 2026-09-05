/**
 * telemetry.ts — anonymous crash-report collection with consent.
 *
 * Professional apps collect crash data so maintainers can fix bugs
 * users never manually report. This module:
 *
 *   1. Saves structured crash reports locally (always, for the user).
 *   2. Optionally marks them for anonymous submission (opt-in).
 *   3. Strips ALL personal paths and PII before saving.
 *   4. Shows a first-launch consent dialog (never silently opts in).
 *   5. Lets the user change their mind any time via Help → Privacy.
 *
 * What IS collected:  error type, sanitized stack, app/Electron/OS
 *                     version, timestamp, process type, uptime.
 * What is NEVER collected:  file contents, personal paths, user data,
 *                           IP addresses, hardware identifiers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, BrowserWindow } from 'electron';
import { APP_NAME, APP_VERSION, USER_DATA_DIR } from './constants';
import { mainLog } from './logger';
import * as store from './store';

// ── Paths ────────────────────────────────────────────────────────────
const REPORTS_DIR = path.join(USER_DATA_DIR, 'crash-reports');

// ── PII scrubber ─────────────────────────────────────────────────────
// Replaces Windows/macOS/Linux home paths and any absolute paths with
// placeholders so the report never leaks the user's filesystem layout.
const HOME = app.getPath('home');
const SCRUB_PATTERNS: Array<[RegExp, string]> = [
  // User home directory (e.g., C:\Users\Alice → <home>)
  [new RegExp(HOME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<home>'],
  // Generic Windows user paths
  [/[A-Z]:\\Users\\[^\\]+/gi, '<home>'],
  // Generic Unix home paths
  [/\/home\/[^/]+/g, '<home>'],
  [/\/Users\/[^/]+/g, '<home>'],
  // Absolute Windows paths (C:\...)
  [/[A-Z]:\\[^\s:]+/gi, '<path>'],
  // Absolute Unix paths that look like file paths (not URLs)
  [/(?<!\w:)\/(?:usr|var|tmp|opt|etc|home|Users|proc|sys)\/[^\s:]+/g, '<path>'],
];

function scrub(text: string): string {
  let out = text;
  for (const [re, replacement] of SCRUB_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

// ── Crash report structure ───────────────────────────────────────────
export interface CrashReport {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** 'uncaughtException' | 'unhandledRejection' | 'render-crash' */
  type: string;
  /** Error message (scrubbed) */
  message: string;
  /** Stack trace (scrubbed) */
  stack: string;
  /** App version */
  appVersion: string;
  /** Electron version */
  electronVersion: string;
  /** Node version */
  nodeVersion: string;
  /** OS platform */
  platform: string;
  /** OS architecture */
  arch: string;
  /** Seconds since app start */
  uptime: number;
  /** Whether the user has opted into anonymous reporting */
  consentGiven: boolean;
}

// ── Consent management ───────────────────────────────────────────────
export type TelemetryConsent = 'granted' | 'denied' | 'unset';

export function getConsent(): TelemetryConsent {
  return store.get('telemetryConsent') ?? 'unset';
}

export function setConsent(consent: TelemetryConsent): void {
  store.set('telemetryConsent', consent);
  mainLog.info(`telemetry consent set to: ${consent}`);
}

export function isConsentGranted(): boolean {
  return getConsent() === 'granted';
}

/**
 * Show a first-launch consent dialog. Non-blocking, returns the choice.
 * Only shown when consent is 'unset'. Never auto-opts-in.
 */
export async function showConsentDialog(): Promise<TelemetryConsent> {
  if (getConsent() !== 'unset') return getConsent();

  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const { response } = await dialog.showMessageBox({
    ...(win ? { parentWindow: win } : {}),
    type: 'question',
    title: `${APP_NAME} — Help Improve the App`,
    message: 'Help improve ProofGraph?',
    detail: [
      'When crashes or errors happen, ProofGraph can save anonymous',
      'reports to help the developers fix bugs faster.',
      '',
      'What\'s collected:',
      '  • Error type and sanitized stack trace',
      '  • App version, OS type, and uptime',
      '',
      'What\'s NEVER collected:',
      '  • Your files, code, or proof content',
      '  • Personal paths, usernames, or any identifying info',
      '',
      'Reports are saved locally. You can view, delete, or change',
      'this setting any time via Help → Privacy & Crash Reports.',
    ].join('\n'),
    buttons: ['Yes, help improve', 'No thanks'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  const consent: TelemetryConsent = response === 0 ? 'granted' : 'denied';
  setConsent(consent);
  return consent;
}

// ── Report collection ────────────────────────────────────────────────
function ensureReportsDir(): void {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Save a crash report to disk. Always saves locally (so the user can
 * view their own crash history); marks the report with their consent
 * status for optional future submission.
 */
export function saveCrashReport(
  type: string,
  error: Error | unknown,
): CrashReport | null {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const report: CrashReport = {
      timestamp: new Date().toISOString(),
      type,
      message: scrub(err.message),
      stack: scrub(err.stack ?? '(no stack)'),
      appVersion: APP_VERSION,
      electronVersion: process.versions.electron ?? 'unknown',
      nodeVersion: process.versions.node ?? 'unknown',
      platform: process.platform,
      arch: process.arch,
      uptime: Math.round(process.uptime()),
      consentGiven: isConsentGranted(),
    };

    ensureReportsDir();

    // Filename: crash-<ISO-date>-<random>.json
    const ts = report.timestamp.replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 8);
    const filename = `crash-${ts}-${rand}.json`;
    const filepath = path.join(REPORTS_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
    mainLog.info(`crash report saved: ${filename}`);

    // Prune old reports (keep most recent 50)
    pruneReports(50);

    return report;
  } catch (saveErr) {
    mainLog.warn('failed to save crash report', saveErr);
    return null;
  }
}

// ── Report management ────────────────────────────────────────────────
/** List saved crash reports, newest first. */
export function listReports(): string[] {
  try {
    ensureReportsDir();
    return fs.readdirSync(REPORTS_DIR)
      .filter((f) => f.startsWith('crash-') && f.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Read a specific crash report. */
export function readReport(filename: string): CrashReport | null {
  try {
    const filepath = path.join(REPORTS_DIR, filename);
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Delete all crash reports. */
export function clearReports(): void {
  try {
    for (const f of listReports()) {
      fs.unlinkSync(path.join(REPORTS_DIR, f));
    }
    mainLog.info('all crash reports cleared');
  } catch (err) {
    mainLog.warn('failed to clear crash reports', err);
  }
}

/** Keep only the N most recent reports. */
function pruneReports(keep: number): void {
  const reports = listReports();
  if (reports.length <= keep) return;
  for (const old of reports.slice(keep)) {
    try { fs.unlinkSync(path.join(REPORTS_DIR, old)); }
    catch { /* already gone */ }
  }
}

/** The crash-reports directory path (for "open in file manager"). */
export function getReportsDir(): string {
  ensureReportsDir();
  return REPORTS_DIR;
}

/**
 * Build a summary of recent crashes for inclusion in a bug report.
 * Returns scrubbed text safe for public GitHub Issues.
 */
export function recentCrashSummary(maxReports = 3): string {
  const reports = listReports().slice(0, maxReports);
  if (reports.length === 0) return '(no recent crash reports)';

  return reports.map((f) => {
    const r = readReport(f);
    if (!r) return `- ${f}: (unreadable)`;
    return [
      `- **${r.type}** at ${r.timestamp}`,
      `  ${r.message}`,
      `  uptime: ${r.uptime}s`,
    ].join('\n');
  }).join('\n');
}
