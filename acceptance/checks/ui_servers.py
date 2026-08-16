"""step 3 plumbing — EPHEMERAL ai server, vite child, hub-per-page driver.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).

step 3 is the HEADLESS UI ACCEPTANCE (the DEFAULT browser-check path;
HEADLESS-UI round, remediation worklist item 5).  A REAL Chromium
(headless=new over CDP) driven by acceptance/headless/headless_ui.mjs:
DOM/a11y reads + the §7.8 spike-surface pins, ZERO pixel screenshots (the
old screenshot capture — browser_shot.mjs — could hang on the Monaco canvas
and needed a person; it remains an OPTIONAL manual tool, never part of this
gate).  Every server is EPHEMERAL (vite included); the browser reaches
fixtures only through a TEMP COPY declared as the hub workspace, so the
real fixtures are never writable through /fs — asserted byte-for-byte in
browser_step.py.
"""
from __future__ import annotations

import collections
import json
import shutil
import socket
import subprocess
import tempfile
import threading
from pathlib import Path

from .common import (AI_DIR, APP_DIR, EVIDENCE_DIR, HEADLESS_DIR, ROOT,
                     hub_server, kill_tree, last_json_line, run_node,
                     wait_port)


def _drain(stream, tail):
    """[H6] Background pipe drainer — pushes each line into a bounded deque
    (post-mortem-viewable) then discards; on kill_tree the stream closes and
    the iterator raises, which we swallow so the daemon exits cleanly."""
    try:
        for line in stream:
            tail.append(line)
    except (ValueError, OSError):
        pass


def _spawn_ai(hub_base: str):
    """Spawn an EPHEMERAL ai server pointed at an ephemeral hub (the additive
    --port 0 --hub seam, green-flow round).  Returns (proc, ai_base).

    [H6] Both stdout and stderr are drained by daemon threads: stderr from
    spawn (previously not read at all — the >64KB pipe-full deadlock class);
    stdout by the ready-detector until the ready line, then by a drainer.
    Without this the ai child blocks on its first post-startup write past
    the 64KB pipe buffer."""
    proc = subprocess.Popen(
        ["node", str(AI_DIR / "server.ts"), "--port", "0", "--hub", hub_base],
        cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace")
    ready: dict = {}
    stderr_tail: collections.deque = collections.deque(maxlen=200)
    stdout_tail: collections.deque = collections.deque(maxlen=200)
    threading.Thread(target=_drain, args=(proc.stderr, stderr_tail),
                     daemon=True).start()

    def _read():
        for line in proc.stdout:                    # pragma: no branch
            stdout_tail.append(line)
            line = line.strip()
            if line.startswith("{"):
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if "ready" in obj:
                    ready.update(obj)
                    return

    t = threading.Thread(target=_read, daemon=True)
    t.start()
    t.join(30)
    if not ready.get("ready"):
        kill_tree(proc)
        raise RuntimeError(f"ai server did not become ready: {ready or 'no ready line'}")
    threading.Thread(target=_drain, args=(proc.stdout, stdout_tail),
                     daemon=True).start()
    return proc, f"http://127.0.0.1:{ready['port']}"


def free_port() -> int:
    """An OS-granted free port (bind 0, read, close).  The tiny bind→spawn
    race is absorbed by the caller's bounded retry."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _spawn_vite(port: int):
    """A PRIVATE vite dev child on an EPHEMERAL port — the live stack's fixed
    5199 is never squatted OR reused (the UI acceptance is fully
    self-contained; a fresh origin also guarantees default layout/prefs in
    the browser).  Plain node child (no npm.cmd indirection) so the Windows
    tree-kill is deterministic."""
    vite_entry = APP_DIR / "node_modules" / "vite" / "bin" / "vite.js"
    vite_log = EVIDENCE_DIR / "vite-dev.log"
    vlf = open(vite_log, "w", encoding="utf-8")
    proc = subprocess.Popen(
        ["node", str(vite_entry), "--port", str(port), "--strictPort"],
        cwd=str(APP_DIR), stdout=vlf, stderr=subprocess.STDOUT)
    if not wait_port(port, 90):
        kill_tree(proc)
        vlf.close()
        tail = vite_log.read_text(encoding="utf-8", errors="replace")[-800:]
        raise RuntimeError(f"vite did not open :{port} (strictPort); log tail: {tail}")
    return proc, vlf


def _ui_page(session, page: str, spec: dict, vite_port: int,
             fixture: Path, ws: dict) -> tuple[int, dict]:
    """ONE page: temp fixture copy → ephemeral hub (workspace declared on the
    COPY) + ephemeral ai → headless_ui.mjs.  Everything torn down; evidence
    persisted to acceptance/evidence/ui-<page>.json."""
    from urllib.parse import quote
    tmp = Path(tempfile.mkdtemp(prefix=f"pg-ui-{page}-"))
    hub = None
    ai_proc = None
    try:
        if fixture.is_dir():
            shutil.copytree(fixture, tmp / fixture.name)
        else:
            shutil.copy2(fixture, tmp / fixture.name)
        hub = hub_server.HubServer(session["pipeline"], log=session["hubLog"]).start()
        hub.attach_analysis(session["analysis"], note=f"run_demo ui step {page}")
        hub.set_workspace(tmp, package=ws.get("package"),
                          pyright_mode=ws.get("pyrightMode"),
                          declared_roots=session["declaredRoots"],
                          note="run_demo ui step — workspace is a TEMP COPY of "
                               "the fixture (real fixtures never writable "
                               "through /fs; copy deleted after the page)")
        hub_base = f"http://127.0.0.1:{hub.http_port}"
        ai_proc, ai_base = _spawn_ai(hub_base)
        url = (f"http://localhost:{vite_port}/?hub={quote(hub_base, safe='')}"
               f"&ai={quote(ai_base, safe='')}")
        spec_path = EVIDENCE_DIR / f"ui-spec-{page}.json"
        spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
        rc, out, err = run_node(
            ["node", str(HEADLESS_DIR / "headless_ui.mjs"),
             "--url", url, "--spec", str(spec_path)],
            timeout_s=420)
        ev = last_json_line(out) or {}
        if rc != 0 and err:
            ev.setdefault("stderrTail", err.splitlines()[-5:])
        (EVIDENCE_DIR / f"ui-{page}.json").write_text(
            json.dumps(ev, indent=2), encoding="utf-8")
        return rc, ev
    finally:
        if ai_proc is not None:
            kill_tree(ai_proc)
        if hub is not None:
            hub.stop()
        shutil.rmtree(tmp, ignore_errors=True)
