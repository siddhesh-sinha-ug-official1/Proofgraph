/**
 * reporter.ts — bug reporting and crash handling.
 *
 * "Report Bug" opens a pre-filled GitHub Issue with:
 *   - App version, Electron version, OS, architecture.
 *   - Recent crash summaries (scrubbed of PII).
 *   - No personal paths, no log content (user can attach logs manually).
 *
 * Uncaught exceptions and unhandled rejections are:
 *   1. Logged via electron-log (file + console).
 *   2. Saved as a structured crash report (see telemetry.ts).
 *   3. Shown in a dialog (uncaughtException only).
 */
import { app, dialog, shell, BrowserWindow } from 'electron';
import { APP_NAME, APP_VERSION, ISSUES_URL } from './constants';
import { mainLog, LOG_DIR } from './logger';
import { saveCrashReport, recentCrashSummary } from './telemetry';

// ── Bug report ────────────────────────────────────────────────────────
export function openBugReport(): void {
  const crashes = recentCrashSummary(3);
  const body = [
    '**Describe the bug**',
    'A clear description of what happened.',
    '',
    '**Steps to reproduce**',
    '1. ...',
    '',
    '**Expected behavior**',
    'What you expected to happen.',
    '',
    '**Environment**',
    `- ProofGraph: v${APP_VERSION}`,
    `- Electron: ${process.versions.electron}`,
    `- OS: ${process.platform} ${process.arch}`,
    '',
    '**Recent crash reports**',
    crashes,
    '',
    '**Logs**',
    `Attach log files from: Help → View Logs`,
  ].join('\n');

  const url = `${ISSUES_URL}?`
    + `title=${encodeURIComponent('[Bug] ')}`
    + `&body=${encodeURIComponent(body)}`
    + `&labels=${encodeURIComponent('bug')}`;

  shell.openExternal(url);
}

// ── Crash handler ─────────────────────────────────────────────────────
export function installCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    mainLog.error('uncaughtException', err);
    saveCrashReport('uncaughtException', err);
    showCrashDialog(err);
  });

  process.on('unhandledRejection', (reason) => {
    mainLog.error('unhandledRejection', reason);
    saveCrashReport('unhandledRejection', reason);
    // Don't show dialog for rejections — they're usually non-fatal.
  });
}

function showCrashDialog(err: Error): void {
  const win = BrowserWindow.getAllWindows()[0] ?? undefined;
  dialog.showMessageBox({
    ...(win ? { parentWindow: win } : {}),
    type: 'error',
    title: `${APP_NAME} — Unexpected Error`,
    message: 'An unexpected error occurred.',
    detail: [
      err.message,
      '',
      'A crash report has been saved locally.',
      'Check Help → Privacy & Crash Reports to view reports.',
      'Please report this bug via Help → Report Bug.',
    ].join('\n'),
    buttons: ['Continue', 'Quit'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 1) app.quit();
  }).catch(() => {
    // Dialog can reject if the app is quitting mid-dialog.
  });
}
