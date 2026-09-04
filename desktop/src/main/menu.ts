/**
 * menu.ts — native application menu.
 *
 * Platform-aware: macOS gets the standard app menu with About/Quit
 * under the app name; Windows and Linux get File/View/Help.
 */
import { app, Menu, shell, dialog, BrowserWindow } from 'electron';
import { APP_NAME, APP_VERSION, IS_MAC, GITHUB_URL } from './constants';
import { LOG_DIR } from './logger';
import { checkForUpdates } from './updater';
import { openBugReport } from './reporter';

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
      ...(!IS_MAC ? [
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates(true),
        },
        { type: 'separator' as const },
      ] : []),
      IS_MAC ? { role: 'close' as const } : { role: 'quit' as const },
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
