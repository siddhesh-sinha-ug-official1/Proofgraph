#!/usr/bin/env python3
"""freeze-hub.py — PyInstaller freeze for the Python hub server.

Produces a standalone directory (not a single file — faster cold start)
in desktop/resources/hub/ containing serve_app + all dependencies.
The Electron app spawns this executable in production mode; no Python
installation needed on the end user's machine.

Usage:
    cd <repo-root>
    python desktop/scripts/freeze-hub.py

Prerequisites:
    pip install pyinstaller
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent   # repo root
ENTRY = ROOT / "hub" / "serve_app.py"
OUT   = ROOT / "desktop" / "resources" / "hub"

# Packages the hub imports at runtime (via sys.path manipulation).
# PyInstaller's auto-detection misses them because they're not
# installed as pip packages — they live as sibling directories.
HIDDEN_IMPORTS = [
    "pipeline",              # hub/pipeline.py  (imported as flat module)
    "server_core",           # hub/server_core.py
    "server_http_get",
    "server_http_mut",
    "server_ws",
    "server_fs",
    "server_lsp",
    "lsp_backend",
    "lsp_backend_capability",
    "websockets",
    "websockets.sync",
    "websockets.sync.server",
    "rustworkx",
    "networkx",
]

# Data directories to include (cell packages the hub loads).
DATAS = [
    (str(ROOT / "packages" / "capability-layer"), "packages/capability-layer"),
    (str(ROOT / "packages" / "structure-extractor"), "packages/structure-extractor"),
    (str(ROOT / "packages" / "graph-model"), "packages/graph-model"),
    (str(ROOT / "outerwall"), "outerwall"),
    (str(ROOT / "acceptance" / "fixtures"), "acceptance/fixtures"),
]


def main() -> int:
    if not ENTRY.exists():
        print(f"error: {ENTRY} not found", file=sys.stderr)
        return 1

    # Clean previous build
    if OUT.exists():
        shutil.rmtree(OUT)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--name", "serve_app",
        "--distpath", str(OUT),
        "--workpath", str(ROOT / "desktop" / "resources" / "_pyi_work"),
        "--specpath", str(ROOT / "desktop" / "resources"),
        # Directory mode (faster startup than --onefile)
        "--contents-directory", ".",
    ]

    for imp in HIDDEN_IMPORTS:
        cmd += ["--hidden-import", imp]

    for src, dst in DATAS:
        cmd += ["--add-data", f"{src}{os.pathsep}{dst}"]

    # Hub directory is the "path" so flat imports resolve
    cmd += ["--paths", str(ROOT / "hub")]

    cmd.append(str(ENTRY))

    print(f"[freeze-hub] running PyInstaller…")
    print(f"  entry: {ENTRY}")
    print(f"  output: {OUT}")
    result = subprocess.run(cmd, cwd=str(ROOT))

    # Clean work directory
    work = ROOT / "desktop" / "resources" / "_pyi_work"
    if work.exists():
        shutil.rmtree(work)

    spec = ROOT / "desktop" / "resources" / "serve_app.spec"
    if spec.exists():
        spec.unlink()

    if result.returncode == 0:
        print(f"[freeze-hub] done — {OUT}")
    else:
        print(f"[freeze-hub] PyInstaller failed (exit {result.returncode})")

    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
