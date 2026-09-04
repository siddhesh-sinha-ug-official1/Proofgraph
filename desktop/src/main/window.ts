/**
 * window.ts — BrowserWindow creation and lifecycle.
 *
 * - Remembers position/size across sessions (via store.ts).
 * - In dev mode loads the Vite dev server; in production loads
 *   the pre-built renderer from resources/renderer/index.html.
 * - Passes server ports to the renderer via query parameters
 *   (?hub=...&ai=...) — the existing app already reads these.
 */
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { IS_DEV, ROOT_DIR, APP_NAME } from './constants';
import { winLog } from './logger';
import * as store from './store';
import type { HubPorts, AiPorts } from './servers';

let mainWindow: BrowserWindow | null = null;

function defaultBounds(): store.WindowBounds {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    x: Math.round(width * 0.08),
    y: Math.round(height * 0.08),
    width: Math.round(width * 0.84),
    height: Math.round(height * 0.84),
  };
}

export function createMainWindow(
  hub: HubPorts,
  ai: AiPorts,
): BrowserWindow {
  const saved = store.get('windowBounds') ?? defaultBounds();
  const maximized = store.get('windowMaximized') ?? false;

  const win = new BrowserWindow({
    ...saved,
    minWidth: 800,
    minHeight: 520,
    title: APP_NAME,
    show: false,                            // show after ready-to-show
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (maximized) win.maximize();

  // ── Load the renderer ───────────────────────────────────────────────
  const qs = `?hub=http://127.0.0.1:${hub.httpPort}`
           + `&ai=http://127.0.0.1:${ai.port}`;

  if (IS_DEV) {
    const viteUrl = `http://localhost:5199${qs}`;
    winLog.info(`loading dev URL: ${viteUrl}`);
    win.loadURL(viteUrl);
  } else {
    const indexPath = path.join(ROOT_DIR, 'renderer', 'index.html');
    winLog.info(`loading file: ${indexPath}`);
    win.loadFile(indexPath, {
      search: qs.slice(1),                  // strip leading '?'
    });
  }

  // ── Visibility ──────────────────────────────────────────────────────
  win.once('ready-to-show', () => win.show());

  // ── Persist bounds on move/resize ───────────────────────────────────
  const saveBounds = () => {
    if (win.isMaximized() || win.isMinimized()) return;
    store.set('windowBounds', win.getBounds());
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('maximize', () => store.set('windowMaximized', true));
  win.on('unmaximize', () => store.set('windowMaximized', false));

  // ── Security: restrict navigation ───────────────────────────────────
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = url.startsWith('http://localhost:')
                 || url.startsWith('http://127.0.0.1:')
                 || url.startsWith('file://');
    if (!allowed) {
      winLog.warn(`blocked navigation to ${url}`);
      e.preventDefault();
    }
  });

  win.on('closed', () => { mainWindow = null; });
  mainWindow = win;
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
