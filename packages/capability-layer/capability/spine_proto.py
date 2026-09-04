"""LspClient protocol conveniences + crash/restart/shutdown: initialize,
degrade map, cache keys, didOpen/didChange, tree-kill.  Mixed into
spine.LspClient."""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
import time
import urllib.parse

from .spine_wire import (EXPECTED_METHODS, ServerCrashed, SpineTimeout,
                         path_to_uri, uri_to_path)


class _ProtoMixin:
    # -- protocol conveniences --------------------------------------------

    def initialize(self, root_path):
        self.root_uri = path_to_uri(root_path)
        # [ASSEMBLY CHANGE V1] real servers (pyright) refuse a %3A-encoded
        # drive colon in the workspace root ("<default workspace root> does
        # not exist" -> no source files -> flaky diagnostics).  The root is
        # therefore ALSO sent colon-unquoted + as workspaceFolders — exactly
        # the form cell 3's proven pyright backend uses.  Document uris are
        # untouched (the shim echoes whatever form it was given).
        ws_path = os.path.abspath(root_path).replace("\\", "/")
        if re.match(r"^[A-Za-z]:", ws_path):
            ws_path = ws_path[0].lower() + ws_path[1:]
        ws_uri = "file:///" + urllib.parse.quote(ws_path.lstrip("/"), safe="/:")
        t0 = time.perf_counter_ns()
        resp = self.request("initialize", {
            "processId": os.getpid(),
            "rootUri": ws_uri,
            "workspaceFolders": [{"uri": ws_uri, "name": "root"}],
            "capabilities": {"general": {"positionEncodings": self.client_encodings}},
        })
        nanos = time.perf_counter_ns() - t0
        if self.cold_start_nanos is None:
            self.cold_start_nanos = nanos
        self.last_init_nanos = nanos
        result = resp.get("result") or {}
        self.capabilities = result.get("capabilities") or {}
        self.server_info = result.get("serverInfo") or {}
        self.position_encoding = self.capabilities.get("positionEncoding", "utf-16")
        self._transition("initialized")
        self.notification("initialized", {})
        self._transition("alive")
        self.bus.emit("capability.wire.capabilitiesReadback", "value",
                      self.capabilities, stage="wire")
        return self.capabilities

    def emit_degrade_map(self):
        for method, cap_key in EXPECTED_METHODS:
            if not self.capabilities.get(cap_key):
                self.bus.emit("capability.wire.degrade", "decision",
                              {"method": method, "supported": False, "plan": "skip"},
                              stage="wire")

    def _cache_key(self, text):
        return "|".join([
            (self.server_info or {}).get("version", "unknown"),
            hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
            self.lock_hash,
        ])

    def did_open(self, uri, text):
        key = self._cache_key(text)
        ver, content_hash, lock = key.split("|")
        self.bus.emit("capability.wire.cache.key", "value",
                      {"ybcVersion": ver, "contentHash": content_hash,
                       "lockfileHash": lock}, stage="wire")
        self.bus.emit("capability.wire.cache.hit", "branch",
                      {"key": key, "hit": key in self._cache}, stage="wire")
        self._cache[key] = True
        self.docs[uri] = text
        # [ASSEMBLY CHANGE WC-W8] per-uri monotonic version. didOpen seeds 1;
        # each subsequent didChange increments. See spine_client.py init.
        self.doc_versions[uri] = 1
        self.notification("textDocument/didOpen", {
            "textDocument": {"uri": uri, "languageId": self.language_id,
                             "version": 1, "text": text}})

    def did_change(self, uri, text):
        self.docs[uri] = text
        # [ASSEMBLY CHANGE WC-W8] was hardcoded version=2. A second didChange
        # on the same uri now advances to 3, 4, ... — matching LSP semantics
        # and letting probe waits gate on the actual (uri,version) instead of
        # a baked-in constant that broke on more than one change.
        self.doc_versions[uri] = self.doc_versions.get(uri, 1) + 1
        version = self.doc_versions[uri]
        self.notification("textDocument/didChange", {
            "textDocument": {"uri": uri, "version": version},
            "contentChanges": [{"text": text}]})

    # -- crash / restart / shutdown ---------------------------------------

    @staticmethod
    def _close_pipes(proc):
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            try:
                if stream:
                    stream.close()
            except OSError:
                pass

    @staticmethod
    def _tree_kill(proc):
        """Kill the WHOLE process tree.  On Windows the wired server may be
        a `cmd /c npx ...` wrapper: killing only the cmd process orphans the
        node child.  On POSIX, SIGTERM the process group then SIGKILL the
        group (not just the direct child) if it doesn't exit."""
        if proc is None or proc.poll() is not None:
            return
        if os.name == "nt":
            try:
                subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                               capture_output=True, timeout=15)
            except Exception:
                pass
        else:
            import signal as _sig
            try: os.killpg(os.getpgid(proc.pid), _sig.SIGTERM)
            except OSError: pass
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try: os.killpg(os.getpgid(proc.pid), _sig.SIGKILL)
                except OSError: pass
        try:
            proc.kill()
        except OSError:
            pass
        try: proc.wait(timeout=10)
        except subprocess.TimeoutExpired: pass

    def kill(self):
        """Hard-kill the server process (used by the crash gate)."""
        if self.proc:
            self._tree_kill(self.proc)

    def restart(self):
        self._transition("restarting")
        if self.proc and self.proc.poll() is None:
            self._tree_kill(self.proc)
        if self.proc:
            self._close_pipes(self.proc)
        root = uri_to_path(self.root_uri) if self.root_uri else None
        reopen = dict(self.docs)
        self.docs = {}
        # [ASSEMBLY CHANGE WC-W8] reset version counters on restart; did_open
        # below reseeds each uri's version to 1 (fresh server generation).
        self.doc_versions = {}
        self.start()
        if root:
            self.initialize(root)
        for uri, text in reopen.items():
            self.did_open(uri, text)

    def shutdown(self):
        if self.proc is None:
            return
        if self.proc.poll() is None:
            try:
                self.request("shutdown", None, timeout=10)
                self.notification("exit", {})
            except (ServerCrashed, SpineTimeout, OSError):
                pass
        self.state = "shutdown"
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._tree_kill(self.proc)
        self._close_pipes(self.proc)
