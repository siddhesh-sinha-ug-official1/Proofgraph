"""LspClient core: construction, lifecycle transitions, process spawn and
the reader threads, crash reporting.  Mixed into spine.LspClient."""

from __future__ import annotations

import hashlib
import os
import queue
import subprocess
import threading

from .spine_wire import read_framed


class _ClientCore:
    """Constructor + spawn/crash machinery of the one lifecycle-managed
    stdio LSP connection (see spine.LspClient, the assembled class)."""

    def __init__(self, bus, argv, env=None, server_name="?", lock_path=None,
                 client_encodings=("utf-8", "utf-16"),
                 language_id="yaddabinggiberish"):
        self.bus = bus
        self.argv = list(argv)
        self.extra_env = dict(env or {})
        self.server_name = server_name
        self.client_encodings = list(client_encodings)
        # [ASSEMBLY CHANGE V1] didOpen languageId is now per-profile (pyright
        # keys analysis off it); default preserves the historical wire bytes.
        self.language_id = language_id
        self.stage = "wire"          # pipeline updates this ("wire" → "probe")
        self.proc = None
        self.state = "created"
        self.capabilities = None
        self.server_info = None
        self.position_encoding = None
        self.root_uri = None
        self.docs: dict[str, str] = {}
        # [ASSEMBLY CHANGE WC-W8] per-uri monotonic didChange version. did_open
        # seeds 1; each did_change increments and stamps. Previously did_change
        # hardcoded version=2 and probe waits baked the constant in — a second
        # change would have collided with the first's version on real servers
        # that stamp publishDiagnostics with the request version. self.docs
        # stays a dict[uri,str] (callers read the text; capability.py exposes
        # it as shimState["docs"]) — a sibling dict tracks the counter.
        self.doc_versions: dict[str, int] = {}
        self._queue: queue.Queue = queue.Queue()
        self._pending: list[dict] = []
        self._stderr_buf: list[bytes] = []
        self._next_id = 1
        self._cache: dict[str, bool] = {}
        self.cold_start_nanos = None
        self.last_init_nanos = None
        self._crashed_reported = False
        if lock_path and os.path.exists(lock_path):
            with open(lock_path, "rb") as f:
                self.lock_hash = hashlib.sha256(f.read()).hexdigest()[:16]
        else:
            self.lock_hash = "none"

    # -- lifecycle ---------------------------------------------------------

    def _transition(self, new_state: str):
        self.bus.emit("capability.wire.lifecycle", "state",
                      {"from": self.state, "to": new_state}, stage="wire")
        self.state = new_state

    def start(self):
        env = dict(os.environ)
        env.update(self.extra_env)
        env.setdefault("PYTHONIOENCODING", "utf-8")
        self.proc = subprocess.Popen(
            self.argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, env=env, bufsize=0)
        self._crashed_reported = False
        # per-generation objects handed to the threads as ARGUMENTS: a stale
        # reader from a killed generation can never inject its EOF marker (or
        # stderr) into the new generation's queue after restart()
        q: queue.Queue = queue.Queue()
        buf: list[bytes] = []
        self._queue = q
        self._pending = []
        self._stderr_buf = buf
        self.bus.emit("capability.wire.spawn", "state",
                      {"pid": self.proc.pid, "argv": self.argv, "state": "spawned"},
                      stage="wire")
        self._transition("spawned")
        t = threading.Thread(target=self._reader, args=(self.proc, q), daemon=True)
        t.start()
        t2 = threading.Thread(target=self._stderr_reader, args=(self.proc, buf),
                              daemon=True)
        t2.start()

    @staticmethod
    def _reader(proc, q):
        while True:
            msg = read_framed(proc.stdout)
            if msg is None:
                q.put({"__eof__": True})
                return
            q.put(msg)

    @staticmethod
    def _stderr_reader(proc, buf):
        while True:
            try:
                chunk = proc.stderr.read(4096)
            except ValueError:  # pipe closed by _close_pipes
                return
            if not chunk:
                return
            buf.append(chunk)

    @property
    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None \
            and self.state in ("alive", "initialized", "spawned")

    def _report_crash(self):
        if self._crashed_reported:
            return
        self._crashed_reported = True
        exit_code = self.proc.poll() if self.proc else None
        stderr = b"".join(self._stderr_buf).decode("utf-8", "replace")[-2000:]
        self.bus.emit("capability.wire.crash", "error",
                      {"pid": self.proc.pid if self.proc else None,
                       "stderr": stderr, "exitCode": exit_code}, stage="wire")
        self._transition("crashed")
