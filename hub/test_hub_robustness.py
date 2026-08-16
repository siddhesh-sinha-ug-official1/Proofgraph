"""Hub suite (pre-GitHub remediation, cluster H-hub): H1/H2/H9/H10 regressions."""
from __future__ import annotations

import json
import sys
import threading
import unittest
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import test_hub_base as hb                                          # noqa: E402
from test_hub_base import (FIXTURE, FRAMES_C2S, SKELETON_CONFIG,    # noqa: E402
                           _wait_until, http_get, http_get_json,
                           http_post_json)

import server as hub_server        # noqa: E402

from websockets.sync.client import connect as ws_connect             # noqa: E402
from websockets.exceptions import ConnectionClosed                   # noqa: E402


def setUpModule():
    hb.ensure_stack()


# ==============================================================================
# H1 — the bridge loop names its failure class before hub.lsp.close.
# ==============================================================================

class TestH1BridgeLoopNamedClass(unittest.TestCase):

    def test_backend_start_failure_emits_lsp_backend_dead(self):
        """A backend whose start() throws is named lsp-backend-dead on the
        hub.lsp.error probe BEFORE hub.lsp.close — no silent swallow."""
        class DeadOnStartBackend(hub_server.EchoLspBackend):
            kind = "dead-on-start (test)"

            def start(self, send_to_client):
                raise RuntimeError("simulated backend spawn failure")

        hb.SERVER.attach_lsp_backend(DeadOnStartBackend)
        try:
            n_before = len(hb.LOG.events("hub.lsp.error"))
            with self.assertRaises(ConnectionClosed):
                with ws_connect(hb.WS_BASE + "/lsp") as ws:
                    # server never enters the frame loop — first recv sees close
                    ws.recv(timeout=5)
            _wait_until(lambda: len(hb.LOG.events("hub.lsp.error")) > n_before)
            errs = hb.LOG.events("hub.lsp.error")[n_before:]
            self.assertTrue(errs, "hub.lsp.error must be emitted, not silent")
            payload = errs[-1]["payload"]
            self.assertEqual(payload["failureClass"], "lsp-backend-dead")
            self.assertIn("simulated backend spawn failure", payload["detail"])
            # emitted BEFORE hub.lsp.close (same session)
            close_pins = [e for e in hb.LOG.events("hub.lsp.close")
                          if e["payload"].get("sessionId") == payload["sessionId"]]
            self.assertTrue(close_pins,
                            "hub.lsp.close still fires after the named error")
            self.assertLess(errs[-1]["logicalClock"],
                            close_pins[-1]["logicalClock"])
        finally:
            hb.SERVER.attach_lsp_backend(hub_server.EchoLspBackend)

    def test_client_frame_json_parse_names_lsp_bridge_drop(self):
        """A backend that json-parses (like CapabilityLspBackend) sees a
        JSONDecodeError on a malformed frame — the bridge names it
        lsp-bridge-drop on hub.lsp.error, still before hub.lsp.close."""
        class JsonParsingBackend(hub_server.EchoLspBackend):
            kind = "json-parsing (test)"

            def client_frame(self, frame):
                json.loads(frame)             # like the real capability backend
                super().client_frame(frame)

        hb.SERVER.attach_lsp_backend(JsonParsingBackend)
        try:
            n_before = len(hb.LOG.events("hub.lsp.error"))
            with ws_connect(hb.WS_BASE + "/lsp") as ws:
                ws.send("not-json-at-all")
                try:
                    ws.recv(timeout=5)
                except ConnectionClosed:
                    pass
            _wait_until(lambda: len(hb.LOG.events("hub.lsp.error")) > n_before)
            errs = hb.LOG.events("hub.lsp.error")[n_before:]
            self.assertTrue(errs, "hub.lsp.error must be emitted, not silent")
            payload = errs[-1]["payload"]
            self.assertEqual(payload["failureClass"], "lsp-bridge-drop")
            self.assertIn("malformed JSON", payload["detail"])
        finally:
            hb.SERVER.attach_lsp_backend(hub_server.EchoLspBackend)


# ==============================================================================
# H2 — /pins/history?limit=<non-int> is a typed 400 hub-bad-request.
# ==============================================================================

class TestH2PinsHistoryBadLimit(unittest.TestCase):

    def test_non_integer_limit_typed_400(self):
        status, body = http_get_json("/pins/history?limit=abc")
        self.assertEqual(status, 400, body)
        self.assertEqual(body["failureClass"], "hub-bad-request")
        self.assertIn("abc", body["detail"])
        # the connection is not dropped — a fresh request still succeeds
        status2, _ = http_get_json("/pins/history?limit=1")
        self.assertEqual(status2, 200)

    def test_negative_limit_still_typed_and_positive_ok(self):
        # -1 parses as int, then max(1, int(-1)) clamps to 1 on the surface;
        # not a refusal — the guard here is that no ValueError escapes.
        status, body = http_get_json("/pins/history?limit=-1")
        self.assertEqual(status, 200, body)


# ==============================================================================
# H9 — /analyze triple-swap is atomic; readers never see a torn combination.
# ==============================================================================

class TestH9AnalyzeSwapAtomic(unittest.TestCase):

    def test_state_swap_lock_materialized_and_readers_take_it(self):
        """After the shared fixture stack ran /analyze at least once, the
        _state_swap_lock is present on the hub AND graph/analysis GET
        handlers wrap their read under it (server_http_get._acquire_state_lock)."""
        # Force a POST /analyze so the lazy-init lock exists.
        status, body = http_post_json(
            "/analyze",
            {"root": str(FIXTURE), "extractorConfig": SKELETON_CONFIG})
        self.assertEqual(status, 200, body)
        lock = getattr(hb.SERVER, "_state_swap_lock", None)
        self.assertIsNotNone(lock, "H9: analyze() must materialize the lock")
        # readers acquire the same lock — hold it and prove /graph blocks.
        blocked = threading.Event()

        def read_graph():
            status, _, _ = http_get("/graph")
            blocked.set()
            self.assertEqual(status, 200)

        with lock:
            t = threading.Thread(target=read_graph, daemon=True)
            t.start()
            # the reader must be blocked (the wrapping lock is held here)
            self.assertFalse(blocked.wait(timeout=0.3),
                             "H9: /graph reader must serialize on _state_swap_lock")
        # once released the reader completes
        t.join(timeout=5)
        self.assertTrue(blocked.is_set(),
                        "H9: reader must complete after lock release")


# ==============================================================================
# H10 — busy flag reset on mid-setup exception (no permanent bricking).
# ==============================================================================

class TestH10BusyFlagOrdering(unittest.TestCase):

    def test_mid_setup_exception_releases_busy(self):
        """A backend that raises DURING the bridge frame loop still causes
        the instance busy flag to be cleared — a second connection must be
        able to take the instance afterwards, never a permanent
        lsp-backend-busy."""
        class RaisingBackend(hub_server.EchoLspBackend):
            kind = "raising-mid-loop (test)"

            def client_frame(self, frame):
                raise RuntimeError("mid-loop failure — exercises H10 finally")

        instance = RaisingBackend()
        hb.SERVER.attach_lsp_backend(instance)
        try:
            for _round in range(2):
                # both rounds must succeed — the finally clears busy after
                # each mid-loop exception so the SAME instance is reusable.
                with ws_connect(hb.WS_BASE + "/lsp") as ws:
                    ws.send(FRAMES_C2S[0])
                    try:
                        ws.recv(timeout=5)
                    except ConnectionClosed:
                        pass
                self.assertTrue(_wait_until(
                    lambda: not hb.SERVER._lsp_instance_busy),
                    "H10: _lsp_instance_busy must be reset after any exception")
        finally:
            hb.SERVER.attach_lsp_backend(hub_server.EchoLspBackend)


if __name__ == "__main__":
    unittest.main(verbosity=2)
