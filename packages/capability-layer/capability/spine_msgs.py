"""LspClient message paths: receive/classify/send, request round-trips,
notification waits, and the settled-diagnostics wait.  Mixed into
spine.LspClient."""

from __future__ import annotations

import queue
import time

from .spine_wire import ServerCrashed, SpineTimeout, write_framed


class _MsgMixin:
    # -- receive path ------------------------------------------------------

    def _recv(self, timeout):
        try:
            msg = self._queue.get(timeout=timeout)
        except queue.Empty:
            raise SpineTimeout(f"no message from {self.server_name} in {timeout}s")
        if "__eof__" in msg:
            # normal shutdown reaches EOF too; only report crash if not shutting down
            if self.state not in ("shutdown",):
                self._report_crash()
                raise ServerCrashed(self.server_name)
            raise ServerCrashed(self.server_name)
        return msg

    def _consume(self, msg):
        """Classify one incoming message. Returns a response dict or None."""
        if msg.get("method") == "$/probe":
            p = msg.get("params") or {}
            self.bus.emit(p.get("probeId", "capability.shim.send"),
                          p.get("kind", "value"), p.get("payload"),
                          stage="shim", cause_id=p.get("cause"))
            return None
        self.bus.emit("capability.probe.msg", "call",
                      {"direction": "recv", "message": msg}, stage=self.stage)
        if "method" in msg:
            if "id" in msg:
                # [ASSEMBLY CHANGE V1] a server->client REQUEST: real servers
                # (pyright) block their analysis loop until it is answered —
                # the reference shim never sends one, so this path is inert
                # for the fixture languages.  Answered on the wire (and thus
                # visible as a capability.probe.msg send lead), never queued.
                if msg["method"] == "workspace/configuration":
                    items = (msg.get("params") or {}).get("items", [])
                    self._send({"id": msg["id"],
                                "result": [{} for _ in items]})
                else:
                    self._send({"id": msg["id"], "result": None})
                return None
            self._pending.append(msg)
            return None
        return msg  # a response

    # -- send path ---------------------------------------------------------

    def _send(self, msg):
        self.bus.emit("capability.probe.msg", "call",
                      {"direction": "send", "message": msg}, stage=self.stage)
        try:
            write_framed(self.proc.stdin, dict(msg, jsonrpc="2.0"))
        except OSError:
            self._report_crash()
            raise ServerCrashed(self.server_name)

    def request(self, method, params, timeout=30):
        mid = self._next_id
        self._next_id += 1
        self._send({"id": mid, "method": method, "params": params})
        while True:
            msg = self._recv(timeout)
            resp = self._consume(msg)
            if resp is not None and resp.get("id") == mid:
                return resp

    def notification(self, method, params):
        self._send({"method": method, "params": params})

    def wait_diagnostics_settled(self, uri, versions=None, grace=3.0,
                                 timeout=180,
                                 progress_method="$/lean/fileProgress"):
        """[ASSEMBLY CHANGE CAP-LEAN] the SETTLED publishDiagnostics for one
        document.  Real incremental elaborators (lean) publish diagnostics
        PROGRESSIVELY per snapshot — the first publish after didOpen/didChange
        may be an empty or partial set, so "take the first matching publish"
        (the fixture-language path) can read a not-yet-final answer.  Measured
        orderings on lean v4.32.0 are inconsistent between the two paths:
        didOpen publishes [], [], then the real set BEFORE the progress-done
        notification; didChange publishes progress-done FIRST and the real
        set after.  This wait therefore treats the server's progress
        notification (empty `processing` list) only as an activity signal and
        returns the LAST matching publish once progress is done and the wire
        has stayed quiet of matching publishes for `grace` seconds.  Used only
        by profiles that declare settleDiagnostics — fixture-language wire
        behavior is byte-identical (this method is never called for them)."""
        def pub_match(m):
            return (m.get("method") == "textDocument/publishDiagnostics"
                    and m["params"]["uri"] == uri
                    and (versions is None
                         or m["params"].get("version") in versions))

        def prog_done(m):
            if m.get("method") != progress_method:
                return False
            p = m.get("params") or {}
            td = p.get("textDocument") or {}
            return td.get("uri") == uri and not (p.get("processing") or [])

        deadline = time.time() + timeout
        last_pub = None
        done_seen = False
        settle_end = None
        while True:
            i = 0
            while i < len(self._pending):
                m = self._pending[i]
                if pub_match(m):
                    last_pub = self._pending.pop(i)
                    settle_end = (time.time() + grace) if done_seen else None
                    continue
                if prog_done(m):
                    done_seen = True
                    self._pending.pop(i)
                    if last_pub is not None and settle_end is None:
                        settle_end = time.time() + grace
                    continue
                i += 1
            now = time.time()
            if (done_seen and last_pub is not None
                    and settle_end is not None and now >= settle_end):
                return last_pub
            if now >= deadline:
                if last_pub is not None:
                    return last_pub
                raise SpineTimeout(
                    f"no settled diagnostics for {uri} from "
                    f"{self.server_name} in {timeout}s")
            wait = (settle_end - now) if settle_end else (deadline - now)
            wait = max(0.05, min(wait, 1.0))
            try:
                msg = self._queue.get(timeout=wait)
            except queue.Empty:
                continue
            if "__eof__" in msg:
                if self.state not in ("shutdown",):
                    self._report_crash()
                raise ServerCrashed(self.server_name)
            self._consume(msg)

    def wait_notification(self, method, pred=None, timeout=30):
        for i, msg in enumerate(self._pending):
            if msg.get("method") == method and (pred is None or pred(msg)):
                return self._pending.pop(i)
        while True:
            msg = self._recv(timeout)
            self._consume(msg)
            for i, m in enumerate(self._pending):
                if m.get("method") == method and (pred is None or pred(m)):
                    return self._pending.pop(i)
