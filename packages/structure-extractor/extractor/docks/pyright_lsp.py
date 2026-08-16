"""Live Pyright backend: `pyright-langserver --stdio` over JSON-RPC
(npx subprocess; nothing is linked).  Split from pyright_backend.py (SUB200
restructure) — pyright_backend.py stays the import surface (facade).
"""
from __future__ import annotations

import json
import queue
import shutil
import subprocess
import sys
import threading
from pathlib import Path

from .pyright_common import BackendTimeout, LspError, _norm, _uri_to_path


class LspPyrightBackend:
    """Minimal JSON-RPC client for pyright-langserver over stdio.

    Wire-path rule (remediation round, package-root-uri-mismatch FIX): the
    caller's `rel` keys are the DOCK's file vocabulary (ingest-root-relative
    SourceFile.path).  Every LSP wire uri is built from the didOpen'd ABSOLUTE
    path under the DETECTED project root — never by joining the dock's rel key
    onto project_root, which mis-roots the uri whenever the ingest root is not
    the project root (a bare package dir: project root = the package PARENT,
    rel = "core.py" → old join produced <parent>/core.py, an unopened
    non-file, and every definition lookup honestly returned []).  Responses
    are mapped BACK into the dock's vocabulary via the same table, so node
    ids / span.file never change — only the wire paths do.
    """

    mode = "live-lsp"

    def __init__(self, project_root: Path, files: list[tuple[str, Path]],
                 timeout_ms: int = 60000):
        self.project_root = project_root.resolve()
        self.timeout_ms = timeout_ms
        self._id = 0
        self._q: "queue.Queue[dict]" = queue.Queue()
        # rel (dock vocabulary) <-> didOpen'd absolute path, both directions.
        # normcase keys absorb pyright's drive-letter lowercasing on Windows
        # (a:/… in response uris vs A:\… on our side).
        self._abs_by_rel: dict[str, Path] = {
            rel: abspath.resolve() for rel, abspath in files}
        self._rel_by_norm: dict[str, str] = {
            _norm(abspath): rel for rel, abspath in self._abs_by_rel.items()}
        npx = shutil.which("npx")
        if npx is None:
            raise FileNotFoundError("npx not found — pyright subprocess unavailable")
        cmd = ["cmd", "/c", "npx", "--yes", "-p", "pyright", "pyright-langserver", "--stdio"] \
            if sys.platform == "win32" else \
            [npx, "--yes", "-p", "pyright", "pyright-langserver", "--stdio"]
        self._cmdline = " ".join(cmd)
        self.proc = subprocess.Popen(cmd, cwd=str(self.project_root),
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL)
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        root_uri = self.project_root.as_uri()
        self._request("initialize", {
            "processId": None, "rootUri": root_uri, "capabilities": {},
            "workspaceFolders": [{"uri": root_uri, "name": "cell"}]})
        self._notify("initialized", {})
        for rel, abspath in files:
            self._notify("textDocument/didOpen", {"textDocument": {
                "uri": abspath.resolve().as_uri(), "languageId": "python",
                "version": 1, "text": abspath.read_text(encoding="utf8")}})

    # -- wire ---------------------------------------------------------------
    def _write(self, msg: dict) -> None:
        body = json.dumps(msg).encode("utf8")
        self.proc.stdin.write(b"Content-Length: %d\r\n\r\n" % len(body) + body)
        self.proc.stdin.flush()

    def _read_loop(self) -> None:
        stdout = self.proc.stdout
        try:
            while True:
                headers = {}
                while True:
                    line = stdout.readline()
                    if not line:
                        return
                    line = line.strip()
                    if not line:
                        break
                    k, _, v = line.partition(b":")
                    headers[k.strip().lower()] = v.strip()
                length = int(headers.get(b"content-length", b"0"))
                body = stdout.read(length)
                if not body:
                    return
                self._q.put(json.loads(body.decode("utf8")))
        except Exception:
            return

    def _notify(self, method: str, params: dict) -> None:
        self._write({"jsonrpc": "2.0", "method": method, "params": params})

    def _request(self, method: str, params: dict):
        self._id += 1
        rid = self._id
        self._write({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        while True:
            try:
                msg = self._q.get(timeout=self.timeout_ms / 1000)
            except queue.Empty:
                raise BackendTimeout("pyright", self._cmdline, self.timeout_ms) from None
            if msg.get("id") == rid and ("result" in msg or "error" in msg):
                if "error" in msg and "result" not in msg:
                    err = msg["error"] or {}
                    raise LspError(method, err.get("code"), str(err.get("message")))
                return msg.get("result")
            if "method" in msg and "id" in msg:      # server -> client request
                if msg["method"] == "workspace/configuration":
                    items = msg.get("params", {}).get("items", [])
                    self._write({"jsonrpc": "2.0", "id": msg["id"], "result": [{} for _ in items]})
                else:
                    self._write({"jsonrpc": "2.0", "id": msg["id"], "result": None})
            # notifications (diagnostics etc.) are drained silently here; the
            # dock probes the request/response pair it actually consumes.

    # -- protocol -----------------------------------------------------------
    def definitions(self, rel_file: str, line: int, character: int) -> list[dict] | None:
        # Wire uri = the didOpen'd absolute path for this dock-vocabulary key
        # (identical bytes to the didOpen uri — pyright answers for opened
        # files only).  Unknown keys keep the legacy project-root join as a
        # last resort (such a file was never didOpen'd; pyright will answer
        # from disk or not at all — never a crash).
        known = self._abs_by_rel.get(rel_file)
        uri = (known if known is not None
               else (self.project_root / rel_file).resolve()).as_uri()
        result = self._request("textDocument/definition", {
            "textDocument": {"uri": uri}, "position": {"line": line, "character": character}})
        if result is None:
            return []
        locs = result if isinstance(result, list) else [result]
        out = []
        for loc in locs:
            target_uri = loc.get("uri") or loc.get("targetUri")
            rng = loc.get("range") or loc.get("targetSelectionRange") or loc.get("targetRange")
            if not target_uri or not rng:
                continue
            p = _uri_to_path(target_uri)
            rel_known = self._rel_by_norm.get(_norm(p))
            if rel_known is not None:
                # a didOpen'd project file → the DOCK's own vocabulary
                rel, external = rel_known, False
            else:
                try:
                    rel = p.resolve().relative_to(self.project_root).as_posix()
                    external = False
                except ValueError:
                    rel = str(p)
                    external = True
            out.append({"file": rel, "line": rng["start"]["line"],
                        "character": rng["start"]["character"], "external": external})
        return out

    def close(self) -> None:
        try:
            self._request("shutdown", {})
            self._notify("exit", {})
        except Exception:
            pass
        try:
            self.proc.terminate()
        except Exception:
            pass
        # On Windows the spawned command is a `cmd /c npx ...` TREE: terminating
        # the cmd wrapper orphans the node child (observed: five orphaned
        # pyright-langserver node processes).  Failure class: orphaned
        # subprocess tree — guarded by an explicit tree kill.
        # (Post-review fix from the cell's final DONE state at
        # A:\23lean-push — the assembly copy was taken mid-build and
        # predated it; ported during the schema swap, baseline sync only.)
        if sys.platform == "win32":
            try:
                subprocess.run(["taskkill", "/PID", str(self.proc.pid), "/T", "/F"],
                               capture_output=True, timeout=15)
            except Exception:
                pass
        try:
            self.proc.wait(timeout=10)
        except Exception:
            pass
