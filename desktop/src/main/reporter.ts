/**
 * reporter.ts — bug reporting and crash handling.
 *
 * "Report Bug" opens a pre-filled GitHub Issue with:
 *   - App version, Electron version, OS, architecture.
 *   - No personal paths, no log content (user can attach logs manually).
 *
 * Uncaught exceptions are logged to the file transport and, if the
 * window is available, shown in a non-blocking error dialog.
 */
import { app, dialog, shell, BrowserWindow } from 'electron';
import { APP_NAME, APP_VERSION, ISSUES_URL } from './constants';
import { mainLog, LOG_DIR } from './logger';

// ── Bug report ────────────────────────────────────────────────────────
export function openBugReport(): void {
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
    showCrashDialog(err);
  });

  process.on('unhandledRejection', (reason) => {
    mainLog.error('unhandledRejection', reason);
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
      'The app may be unstable. Check Help → View Logs for details.',
      'Please report this bug via Help → Report Bug.',
    ].join('\n'),
    buttons: ['Continue', 'Quit'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 1) app.quit();
  });
}
