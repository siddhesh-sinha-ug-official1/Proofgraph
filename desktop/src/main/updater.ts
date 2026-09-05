/**
 * updater.ts — auto-update from GitHub Releases via electron-updater.
 *
 * Flow:
 *   1. App start → silent check (5 s after window shows).
 *   2. Update found → download in background.
 *   3. Download complete → notify user: "Restart to update?"
 *   4. User clicks Restart → quitAndInstall().
 *
 * In dev mode, update checks are skipped entirely (no packaged app to
 * compare versions against).
 */
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { dialog, BrowserWindow } from 'electron';
import { IS_DEV, APP_NAME } from './constants';
import { updLog } from './logger';

let initialized = false;
let updateDownloaded = false;
let downloadedVersion = '';
// Track whether an interactive check is in flight so we can show
// the "up to date" dialog exactly once, without stacking listeners.
let interactiveCheckPending = false;

function init() {
  if (initialized) return;
  initialized = true;

  autoUpdater.logger = updLog;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    updLog.info(`update available: v${info.version}`);
    // An update was found — clear the interactive flag so no stale
    // "up to date" dialog fires.
    interactiveCheckPending = false;
  });

  autoUpdater.on('update-not-available', () => {
    updLog.info('no update available');
    if (interactiveCheckPending) {
      interactiveCheckPending = false;
      dialog.showMessageBox({
        type: 'info',
        title: 'Updates',
        message: `${APP_NAME} is up to date.`,
        buttons: ['OK'],
      });
    }
  });

  autoUpdater.on('download-progress', (p) => {
    updLog.info(`download: ${Math.round(p.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    updLog.info(`downloaded v${info.version} — ready to install`);
    updateDownloaded = true;
    downloadedVersion = info.version;
    promptInstall(info.version);
  });

  autoUpdater.on('error', (err) => {
    updLog.error('auto-update error', err);
    interactiveCheckPending = false;
  });
}

async function promptInstall(version: string): Promise<void> {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const { response } = await dialog.showMessageBox({
    ...(win ? { parentWindow: win } : {}),
    type: 'info',
    title: `${APP_NAME} Update`,
    message: `Version ${version} is ready to install.`,
    detail: 'The app will restart to apply the update.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
  });

  if (response === 0) {
    autoUpdater.quitAndInstall(false, true);
  }
}

/**
 * Check for updates.
 * @param interactive  If true, show a dialog even when no update is found.
 */
export function checkForUpdates(interactive: boolean): void {
  if (IS_DEV) {
    if (interactive) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Updates',
        message: 'Update checks are disabled in development mode.',
        buttons: ['OK'],
      });
    }
    return;
  }

  init();

  if (updateDownloaded) {
    promptInstall(downloadedVersion || '(downloaded)');
    return;
  }

  interactiveCheckPending = interactive;

  autoUpdater.checkForUpdates().catch((err) => {
    updLog.error('checkForUpdates failed', err);
    interactiveCheckPending = false;
    if (interactive) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates.',
        detail: err instanceof Error ? err.message : String(err),
        buttons: ['OK'],
      });
    }
  });
}
