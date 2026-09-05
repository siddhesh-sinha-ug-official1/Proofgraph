/**
 * splash.ts — startup splash screen.
 *
 * A frameless overlay shown while the hub and AI server spin up.
 * The main process updates the status text via webContents.executeJS;
 * once both servers report ready the splash is closed and the main
 * window is revealed.
 */
import { BrowserWindow } from 'electron';
import { APP_NAME, APP_VERSION } from './constants';

export interface Splash {
  win: BrowserWindow;
  setText(msg: string): void;
  close(): void;
}

const HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #1A1D25; color: #E2E4EA;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh; user-select: none; -webkit-app-region: drag;
  }
  .name { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
  .ver  { font-size: 11px; color: #6B7290; margin-top: 4px; }
  .bar  { margin-top: 28px; width: 180px; height: 3px;
          background: #2E3240; border-radius: 2px; overflow: hidden; }
  .bar-fill { height: 100%; width: 30%; background: #7BA4D4;
              border-radius: 2px;
              animation: slide 1.2s ease-in-out infinite alternate; }
  @keyframes slide { from { margin-left: 0 } to { margin-left: 70% } }
  #status { margin-top: 14px; font-size: 12px; color: #6B7290; }
</style></head><body>
  <div class="name">${APP_NAME}</div>
  <div class="ver">v${APP_VERSION}</div>
  <div class="bar"><div class="bar-fill"></div></div>
  <div id="status">Initializing…</div>
</body></html>`;

export function showSplash(): Splash {
  const win = new BrowserWindow({
    width: 340,
    height: 220,
    frame: false,
    resizable: false,
    transparent: false,
    alwaysOnTop: true,
    center: true,
    show: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`);

  return {
    win,
    setText(msg: string) {
      // Use JSON.stringify for correct escaping (handles quotes,
      // backslashes, newlines) instead of manual single-quote replace.
      win.webContents
        .executeJavaScript(`document.getElementById('status').textContent=${JSON.stringify(msg)}`)
        .catch(() => {});
    },
    close() {
      if (!win.isDestroyed()) win.close();
    },
  };
}
