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
│  ├─ Crash reports (local, PII-scrubbed)          │
│  └─ Window state  (size, position, maximized)    │
└──────────────────────────────────────────────────┘
```

## Quick Start — Install from Installer

**Windows:** Double-click `ProofGraph Setup 1.0.0.exe`. It will:
- Let you choose the install directory
- Create a desktop shortcut and Start Menu entry
- Install all dependencies bundled inside (no Python/Node needed)

Then just double-click the **ProofGraph** icon to launch. Click **X** to close.

**Uninstall:** Settings → Apps → ProofGraph → Uninstall (standard Windows uninstaller).

## Development

Prerequisites: Python 3.12, Node.js ≥ 24, npm dependencies installed
in `app/`, `ai/`, `packages/editor-shell/`, `packages/graph-view/`.

```bash
# 1. Install desktop dependencies
cd desktop && npm ci

# 2. Launch Electron in dev mode (auto-builds + watches)
npm run dev
```

Dev mode spawns `python hub/serve_app.py` + the AI server with ephemeral
ports, then loads the frontend.

## Building the Installer

### One-command build (recommended)

```bash
cd desktop

# Full pipeline: icons → deps → renderer → main/preload → AI bundle → cache fix
node scripts/predist.mjs

# Build Windows installer
npx electron-builder --win --x64
```

The installer lands in `desktop/out/ProofGraph Setup X.Y.Z.exe`.

### With frozen hub (fully self-contained — no Python needed)

```bash
# First, freeze the Python hub (one-time, requires PyInstaller)
pip install pyinstaller
python desktop/scripts/freeze-hub.py

# Then build normally
cd desktop
node scripts/predist.mjs
npx electron-builder --win --x64
```

### Platform-specific

```bash
npx electron-builder --win --x64    # NSIS installer (.exe)
npx electron-builder --mac          # DMG + ZIP
npx electron-builder --linux        # AppImage + .deb
```

### Troubleshooting

**"Cannot create symbolic link" during build:**
The winCodeSign cache fix runs automatically via `predist.mjs`. If it
doesn't, run `node scripts/fix-wincodesign-cache.mjs` manually. This
is a known electron-builder issue on Windows without Developer Mode.

**NSIS mmap error:**
Usually caused by low disk space on C:\ (where TEMP lives). Free up
space or redirect TEMP: `set TEMP=A:\some\dir` before building.

**"signing is skipped":**
Expected for unsigned builds. To sign, set `CSC_LINK` and
`CSC_KEY_PASSWORD` environment variables with your code-signing cert.

## Auto-Update

Uses `electron-updater` with GitHub Releases as the update source.
When you publish a GitHub Release with the installer assets, the
app checks for updates on startup (and via Help → Check for Updates).

To publish a release:

```bash
# Tag and push
git tag v1.0.1
git push origin v1.0.1

# Build and upload
cd desktop && node scripts/predist.mjs
npx electron-builder --win --x64 --publish always
```

## File Locations

| What | Windows | macOS | Linux |
|------|---------|-------|-------|
| Settings | `%APPDATA%/ProofGraph/settings.json` | `~/Library/Application Support/ProofGraph/settings.json` | `~/.config/ProofGraph/settings.json` |
| Logs | `%APPDATA%/ProofGraph/logs/` | `~/Library/Logs/ProofGraph/` | `~/.config/ProofGraph/logs/` |
| Crash reports | `%APPDATA%/ProofGraph/crash-reports/` | `~/Library/Application Support/ProofGraph/crash-reports/` | `~/.config/ProofGraph/crash-reports/` |
| Install | `C:\Users\<you>\AppData\Local\Programs\ProofGraph\` | `/Applications/ProofGraph.app` | `~/.local/share/ProofGraph/` |

## Privacy & Telemetry

- **First launch:** A dialog asks whether to enable anonymous crash reporting
- **Help → Privacy & Crash Reports:** Toggle opt-in/out, view or delete reports
- **Crash reports** are stored locally as JSON with all personal paths scrubbed
- **No data is sent anywhere** unless you explicitly opt in
- Bug reports (Help → Report Bug) include scrubbed crash summaries only
