/**
 * menu.ts — native application menu.
 *
 * Platform-aware: macOS gets the standard app menu with About/Quit
 * under the app name; Windows and Linux get File/View/Help.
 *
 * Menu actions that need renderer cooperation (Open Folder, Analyze,
 * Save) send an IPC message to the focused window's webContents via
 * the 'menu:action' channel. The renderer subscribes once via the
 * preload bridge (window.proofgraph.onMenuAction).
 */
import { app, Menu, shell, dialog, BrowserWindow } from 'electron';
import { APP_NAME, APP_VERSION, IS_MAC, GITHUB_URL } from './constants';
import { LOG_DIR } from './logger';
import { checkForUpdates } from './updater';
import { openBugReport } from './reporter';
import {
  getConsent, setConsent, getReportsDir, listReports, clearReports,
} from './telemetry';

/** Send an action string to the focused renderer window. */
function sendMenuAction(action: string): void {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.webContents.send('menu:action', action);
}

export function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [];

  // ── macOS app menu ──────────────────────────────────────────────────
  if (IS_MAC) {
    template.push({
      label: APP_NAME,
      submenu: [
        {
          label: `About ${APP_NAME}`,
          click: () => showAbout(),
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates(true),
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  // ── File ────────────────────────────────────────────────────────────
  template.push({
    label: 'File',
    submenu: [
      {
        label: 'Open Folder…',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: () => sendMenuAction('openFolder'),
      },
      {
        label: 'Open File…',
        accelerator: 'CmdOrCtrl+O',
        click: () => sendMenuAction('openFile'),
      },
      { type: 'separator' },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => sendMenuAction('save'),
      },
      { type: 'separator' },
      {
        label: 'Run Analysis',
        accelerator: 'CmdOrCtrl+Shift+A',
        click: () => sendMenuAction('analyze'),
      },
      { type: 'separator' },
      {
        label: 'Close Project',
        click: () => sendMenuAction('closeProject'),
      },
      ...(!IS_MAC ? [
        { type: 'separator' as const },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates(true),
        },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ] : [
        { type: 'separator' as const },
        { role: 'close' as const },
      ]),
    ],
  });

  // ── Edit ────────────────────────────────────────────────────────────
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Find…',
        accelerator: 'CmdOrCtrl+F',
        click: () => sendMenuAction('search'),
      },
    ],
  });

  // ── View ────────────────────────────────────────────────────────────
  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  // ── Help ────────────────────────────────────────────────────────────
  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'Documentation',
        click: () => shell.openExternal(`${GITHUB_URL}#readme`),
      },
      {
        label: 'Report Bug…',
        click: () => openBugReport(),
      },
      {
        label: 'View Logs',
        click: () => shell.openPath(LOG_DIR),
      },
      { type: 'separator' },
      {
        label: 'Privacy & Crash Reports…',
        click: () => showPrivacyDialog(),
      },
      { type: 'separator' },
      ...(!IS_MAC ? [{
        label: `About ${APP_NAME}`,
        click: () => showAbout(),
      }] : []),
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout(): void {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  dialog.showMessageBox({
    ...(win ? { parentWindow: win } : {}),
    type: 'info',
    title: `About ${APP_NAME}`,
    message: APP_NAME,
    detail: [
      `Version ${APP_VERSION}`,
      `Electron ${process.versions.electron}`,
      `Node ${process.versions.node}`,
      `Platform ${process.platform} ${process.arch}`,
      '',
      'PolyForm Noncommercial 1.0.0',
    ].join('\n'),
    buttons: ['OK'],
  });
}

async function showPrivacyDialog(): Promise<void> {
  const consent = getConsent();
  const reports = listReports();
  const statusText = consent === 'granted' ? 'Enabled (opted in)'
                   : consent === 'denied'  ? 'Disabled (opted out)'
                   : 'Not yet decided';

  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const { response } = await dialog.showMessageBox({
    ...(win ? { parentWindow: win } : {}),
    type: 'info',
    title: `${APP_NAME} — Privacy & Crash Reports`,
    message: 'Crash Report Settings',
    detail: [
      `Anonymous crash reporting: ${statusText}`,
      `Saved crash reports: ${reports.length}`,
      '',
      'When enabled, crash reports include only:',
      '  • Error type and sanitized stack trace',
      '  • App version, OS type, and uptime',
      '',
      'No personal data, file contents, paths, or code is ever included.',
    ].join('\n'),
    buttons: [
      consent === 'granted' ? 'Opt Out' : 'Opt In',
      'View Reports Folder',
      ...(reports.length > 0 ? ['Delete All Reports'] : []),
      'Close',
    ],
    defaultId: consent === 'granted' ? 3 : 0,
    cancelId: reports.length > 0 ? 3 : 2,
    noLink: true,
  });

  if (response === 0) {
    // Toggle consent
    const newConsent = consent === 'granted' ? 'denied' : 'granted';
    setConsent(newConsent);
    dialog.showMessageBox({
      ...(win ? { parentWindow: win } : {}),
      type: 'info',
      title: 'Crash Reports',
      message: newConsent === 'granted'
        ? 'Anonymous crash reporting enabled.'
        : 'Anonymous crash reporting disabled.',
      detail: newConsent === 'granted'
        ? 'Thank you for helping improve ProofGraph!'
        : 'No crash data will be shared. Local reports are still saved for your reference.',
      buttons: ['OK'],
    });
  } else if (response === 1) {
    shell.openPath(getReportsDir());
  } else if (response === 2 && reports.length > 0) {
    const { response: confirm } = await dialog.showMessageBox({
      ...(win ? { parentWindow: win } : {}),
      type: 'warning',
      title: 'Delete Crash Reports',
      message: `Delete all ${reports.length} crash reports?`,
      detail: 'This cannot be undone.',
      buttons: ['Delete All', 'Cancel'],
      defaultId: 1,
    });
    if (confirm === 0) {
      clearReports();
    }
  }
}
