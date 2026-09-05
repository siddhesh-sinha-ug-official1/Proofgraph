/**
 * window.ts — BrowserWindow creation and lifecycle.
 *
 * - Remembers position/size across sessions (via store.ts).
 * - Validates restored bounds against connected displays.
 * - In dev mode loads the Vite dev server; in production loads
 *   the pre-built renderer from resources/renderer/index.html.
 * - Passes server ports to the renderer via query parameters
 *   (?hub=...&ai=...) — the existing app already reads these.
 */
import { BrowserWindow, screen, shell } from 'electron';
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

/** Check whether `bounds` is at least partially visible on any display. */
function boundsOnScreen(bounds: store.WindowBounds): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((d) => {
    const wa = d.workArea;
    // At least 100px of the window must overlap a work area.
    return bounds.x + bounds.width > wa.x + 50
        && bounds.x < wa.x + wa.width - 50
        && bounds.y + bounds.height > wa.y + 50
        && bounds.y < wa.y + wa.height - 50;
  });
}

export function createMainWindow(
  hub: HubPorts,
  ai: AiPorts,
): BrowserWindow {
  const saved = store.get('windowBounds');
  // Validate restored position against currently-connected displays;
  // fall back to centred defaults if the saved position is off-screen
  // (e.g. external monitor disconnected).
  const bounds = saved && boundsOnScreen(saved) ? saved : defaultBounds();
  const maximized = store.get('windowMaximized') ?? false;

  const win = new BrowserWindow({
    ...bounds,
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

  // ── Persist bounds on move/resize (debounced) ──────────────────────
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const saveBounds = () => {
    if (win.isMaximized() || win.isMinimized()) return;
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      store.set('windowBounds', win.getBounds());
    }, 500);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('maximize', () => store.set('windowMaximized', true));
  win.on('unmaximize', () => store.set('windowMaximized', false));

  // ── Security: restrict navigation ───────────────────────────────────
  // Allow list for the renderer's own origins.  The file:// check is
  // pinned to the renderer directory (production) to prevent navigation
  // to arbitrary local files.
  const rendererDir = path.join(ROOT_DIR, 'renderer');
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = url.startsWith('http://localhost:')
                 || url.startsWith('http://127.0.0.1:')
                 || url.startsWith(`file:///${rendererDir.replace(/\\/g, '/')}`);
    if (!allowed) {
      winLog.warn(`blocked navigation to ${url}`);
      e.preventDefault();
    }
  });

  // Block all window.open / target=_blank — the renderer has no reason
  // to open new windows, and without this handler Electron creates an
  // unrestricted BrowserWindow for each call.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // External links open in the system browser instead.
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.on('closed', () => { mainWindow = null; });
  mainWindow = win;
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
