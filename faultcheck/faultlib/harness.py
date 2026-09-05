"""harness — scratch copies, junctions, anchored patches, suite excerpts.

Carved VERBATIM from faultcheck/run_faults.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

FAULTCHECK_DIR = Path(__file__).resolve().parents[1]
PROOFGRAPH = FAULTCHECK_DIR.parent

# Windows pipes default to the ANSI codepage — suite output we quote (evidence
# lines) may carry UTF-8 arrows etc.; never let the HARNESS crash on printing.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception as _exc:                     # noqa: BLE001 — best effort
        print(f"[harness] stream reconfigure failed: {_exc}", file=sys.stderr)

# node_modules trees a JS-suite scratch copy needs (junctioned, read-only use)
NM_APP = Path("app") / "node_modules"
NM_GVIEW = Path("packages") / "graph-view" / "node_modules"
NM_ESHELL = Path("packages") / "editor-shell" / "node_modules"

IS_WIN = os.name == "nt"
PY = sys.executable


def _env() -> dict:
    env = dict(os.environ)
    env.update({"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
                "NO_COLOR": "1", "FORCE_COLOR": "0", "CI": "true"})
    return env


def run_cmd(cmd: list[str], cwd: Path, timeout_s: int) -> tuple[int, str]:
    """Run a suite command; return (exitcode, combined output)."""
    try:
        p = subprocess.run(cmd, cwd=str(cwd), env=_env(),
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           timeout=timeout_s, text=True, encoding="utf-8",
                           errors="replace")
        return p.returncode, p.stdout or ""
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode("utf-8", "replace") if isinstance(e.stdout, bytes) \
            else (e.stdout or "")
        return -1, out + f"\n[faultcheck] TIMEOUT after {timeout_s}s"


def copy_tree(dst: Path) -> None:
    """Scratch copy of the proofgraph tree.  Excluded (regenerated state,
    never inputs): node_modules (junctioned/symlinked per fault),
    __pycache__, .git, .vite caches, app/dist (the build gate rebuilds
    it), *.pyc."""
    _SKIP_DIRS = {"node_modules", "__pycache__", ".git", ".vite"}

    def _ignore(directory, entries):
        rel = Path(directory).relative_to(PROOFGRAPH)
        ignored = set()
        for e in entries:
            if e in _SKIP_DIRS:
                ignored.add(e)
            elif rel == Path("app") and e == "dist":
                # Only skip app/dist (the build gate rebuilds it);
                # other dist/ dirs (e.g. packages/*/dist/) are kept.
                ignored.add(e)
            elif e.endswith((".pyc", ".pyo")):
                ignored.add(e)
        return ignored

    shutil.copytree(PROOFGRAPH, dst, ignore=_ignore, dirs_exist_ok=True)


def make_junction(link: Path, target: Path) -> None:
    """Create a directory junction (Windows) or symlink (POSIX) from link
    to target.  Junctions on Windows don't require elevated privileges;
    symlinks on POSIX are the natural equivalent."""
    link.parent.mkdir(parents=True, exist_ok=True)
    if IS_WIN:
        rc = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL).returncode
        if rc != 0 or not link.exists():
            raise RuntimeError(f"junction failed: {link} -> {target}")
    else:
        try:
            os.symlink(target, link, target_is_directory=True)
        except OSError as e:
            raise RuntimeError(f"symlink failed: {link} -> {target}: {e}") from e


def patch(path: Path, old: str, new: str) -> None:
    """Anchored injection: OLD must appear EXACTLY ONCE, else the harness
    refuses (a silent no-op would fake the whole exercise)."""
    text = path.read_text(encoding="utf-8")
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"anchor found {n} times (need exactly 1) in {path}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def append(path: Path, tail: str) -> None:
    path.write_text(path.read_text(encoding="utf-8") + tail, encoding="utf-8")


def plant(path: Path, n_lines: int) -> None:
    """Create a NEW source file of exactly n_lines lines (a deliberate
    line-gate ceiling offender).  Refuses to overwrite an existing file — a
    silent overwrite would let a stale fixture masquerade as the injection."""
    if path.exists():
        raise RuntimeError(f"plant target already exists: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "\n".join(f"x{i} = {i}  # planted line-gate offender" for i in range(n_lines))
    path.write_text(body + "\n", encoding="utf-8")


def discard(root: Path, junctions: list[Path]) -> str:
    """Unlink junctions/symlinks FIRST (os.rmdir on Windows removes the
    junction without touching the target; os.unlink on POSIX removes the
    symlink), then rmtree the scratch.  Refuses to delete anything outside
    tempdir."""
    tmp = Path(tempfile.gettempdir()).resolve()
    if tmp not in root.resolve().parents:
        return f"REFUSED (not under {tmp})"
    for j in junctions:
        try:
            if IS_WIN:
                os.rmdir(j)
            else:
                os.unlink(j)
        except OSError as e:
            return f"junction/symlink unlink FAILED ({j.name}: {e}) — tree left at {root}"
    for attempt in (1, 2, 3):
        try:
            shutil.rmtree(root)
            return "discarded"
        except OSError:
            time.sleep(2 * attempt)
    return f"rmtree could not finish (file locks?) — leftover at {root}"


def excerpt(output: str, signatures: list[str], max_lines: int = 6) -> list[str]:
    """The guard's own words: lines carrying a signature, plus the suite's
    summary line — evidence quoted from the REAL suite output."""
    lines = output.splitlines()
    hits: list[str] = []
    for ln in lines:
        if any(s in ln for s in signatures) and ln.strip() and ln.strip() not in hits:
            hits.append(ln.strip())
        if len(hits) >= max_lines - 2:
            break
    for ln in reversed(lines):
        s = ln.strip()
        if s.startswith(("FAILED (", "OK", "Ran ")) or "Test Files" in s \
                or s.startswith("Tests ") or " failed" in s:
            hits.append(s)
            if sum(1 for h in hits if h) >= max_lines:
                break
    return hits[:max_lines]
