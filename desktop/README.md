# ProofGraph Desktop

Electron shell that wraps the ProofGraph web app into a native desktop
application with window chrome, installers, auto-update, and crash
reporting.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Electron shell  (native title bar + menu)       │
│  ┌──────────────────────────────────────────────┐│
│  │  React frontend  (existing app/ build)       ││
│  │  Connected via ?hub=…&ai=… query params      ││
│  └──────────────────────────────────────────────┘│
│  Main process manages:                           │
│  ├─ Hub server    (Python, ephemeral port)       │
│  ├─ AI server     (Node.js, ephemeral port)      │
│  ├─ Auto-updater  (GitHub Releases)              │
│  └─ Window state  (size, position, maximized)    │
└──────────────────────────────────────────────────┘
```

## Development

Prerequisites: Python 3.12, Node.js ≥ 24, npm dependencies installed
in `app/`, `ai/`, `packages/editor-shell/`, `packages/graph-view/`.

```bash
# 1. Install desktop dependencies
cd desktop && npm ci

# 2. Start the Vite dev server (in a separate terminal)
cd app && npm run dev

# 3. Launch Electron in dev mode
cd desktop && npm run dev
```

Dev mode loads the frontend from `http://localhost:5199` and spawns
`python hub/serve_app.py` + `node ai/server.ts` with ephemeral ports.

## Production Build

### Full installer (requires PyInstaller for the hub freeze)

```bash
# 1. Freeze Python hub into a standalone executable
pip install pyinstaller
python desktop/scripts/freeze-hub.py

# 2. Build the renderer
cd app && npm run build

# 3. Bundle the AI server
cd desktop && npm run build:ai

# 4. Build installer for current platform
npm run dist
```

### Platform-specific

```bash
npm run dist:win      # NSIS installer (.exe)
npm run dist:mac      # DMG + ZIP
npm run dist:linux    # AppImage + .deb
```

Output lands in `desktop/out/`.

## Auto-Update

Uses `electron-updater` with GitHub Releases as the update source.
When you publish a GitHub Release with the installer assets, the
app checks for updates on startup (and via Help → Check for Updates).

To publish a release:

```bash
# Tag and push
git tag v1.0.1
git push origin v1.0.1

# Build and upload (electron-builder does this via --publish always)
cd desktop && npm run dist -- --publish always
```

## File Locations

| What | Windows | macOS | Linux |
|------|---------|-------|-------|
| Settings | `%APPDATA%/ProofGraph/settings.json` | `~/Library/Application Support/ProofGraph/settings.json` | `~/.config/ProofGraph/settings.json` |
| Logs | `%APPDATA%/ProofGraph/logs/` | `~/Library/Logs/ProofGraph/` | `~/.config/ProofGraph/logs/` |
| Install | `C:\Users\<you>\AppData\Local\Programs\ProofGraph\` | `/Applications/ProofGraph.app` | `~/.local/share/ProofGraph/` |
