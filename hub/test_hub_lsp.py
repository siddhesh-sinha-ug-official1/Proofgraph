"""Hub suite (split 5/9): WS /lsp — the JSON-RPC frame bridge (echo backend).

Part of the hub/test_hub.py aggregate (SUB200 restructure); shared stack,
frame fixtures and helpers live in hub/test_hub_base.py.  Runnable standalone.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import test_hub_base as hb                                     # noqa: E402
from test_hub_base import (CLIENT_CONFIG_RESPONSE, FRAMES_C2S,  # noqa: E402
                           SERVER_TO_CLIENT_REQUEST, _wait_until)

import server as hub_server      # noqa: E402

from websockets.sync.client import connect as ws_connect          # noqa: E402
from websockets.exceptions import ConnectionClosed                # noqa: E402


def setUpModule():
    hb.ensure_stack()


# ==============================================================================
# 8. WS /lsp — the JSON-RPC frame bridge (echo backend)
# ==============================================================================

class Test08LspBridge(unittest.TestCase):

    def test_echo_roundtrip_byte_exact_both_directions(self):
        with ws_connect(hb.WS_BASE + "/lsp") as ws:
            # client -> server -> echo -> client, in order, byte-exact
            for frame in FRAMES_C2S:
                ws.send(frame)
                echoed = ws.recv(timeout=5)
                self.assertEqual(echoed.encode("utf-8"), frame.encode("utf-8"))
            backend = hb.SERVER.lsp_backends[-1]
            session = hb.SERVER.lsp_sessions[-1]
            # SERVER->CLIENT request (workspace/configuration shape) flows out…
            backend.inject(SERVER_TO_CLIENT_REQUEST)
            got = ws.recv(timeout=5)
            self.assertEqual(got.encode("utf-8"),
                             SERVER_TO_CLIENT_REQUEST.encode("utf-8"))
            # …and the client's RESPONSE flows back to the backend byte-exact
            ws.send(CLIENT_CONFIG_RESPONSE)
            self.assertTrue(_wait_until(
                lambda: CLIENT_CONFIG_RESPONSE in backend.received))
            # (the echo of the response also comes back; drain it)
            self.assertEqual(ws.recv(timeout=5), CLIENT_CONFIG_RESPONSE)
        self.assertTrue(_wait_until(lambda: session.closed))
        # ---- both sides of the bridge seam agree, frame for frame ----
        client_sent = FRAMES_C2S + [CLIENT_CONFIG_RESPONSE]
        self.assertEqual([r["raw"] for r in session.c2s], client_sent)
        self.assertEqual(backend.received, client_sent)
        client_received = (FRAMES_C2S[:1] + FRAMES_C2S[1:2] + FRAMES_C2S[2:3]
                           + [SERVER_TO_CLIENT_REQUEST, CLIENT_CONFIG_RESPONSE])
        self.assertEqual(backend.sent, client_received)
        self.assertEqual([r["raw"] for r in session.s2c], client_received)
        # audit: no drop
        audit = hb.SERVER.audit_lsp_session(session, backend)
        self.assertTrue(audit["ok"])
        # hub pins carry the same counts for this session
        c2s_pins = [e for e in hb.LOG.events("hub.lsp.frame.c2s")
                    if e["payload"]["sessionId"] == session.session_id]
        s2c_pins = [e for e in hb.LOG.events("hub.lsp.frame.s2c")
                    if e["payload"]["sessionId"] == session.session_id]
        self.assertEqual(len(c2s_pins), len(client_sent))
        self.assertEqual(len(s2c_pins), len(client_received))
        self.assertEqual([p["payload"]["sha256"] for p in c2s_pins],
                         session.shas("c2s"))

    def test_bridge_drop_detected_and_named(self):
        """A backend that swallows a frame (simulating loss on the far side
        of the bridge) is caught by the ledger audit: lsp-bridge-drop."""
        class LossyEchoBackend(hub_server.EchoLspBackend):
            kind = "lossy-echo (test)"

            def client_frame(self, frame):
                if len(self.received) == 1 and "definition" in frame:
                    return   # swallow silently — the simulated drop
                super().client_frame(frame)

        hb.SERVER.attach_lsp_backend(LossyEchoBackend)
        try:
            with ws_connect(hb.WS_BASE + "/lsp") as ws:
                ws.send(FRAMES_C2S[0])
                self.assertEqual(ws.recv(timeout=5), FRAMES_C2S[0])
                ws.send(FRAMES_C2S[1])   # dropped by the lossy backend
                ws.send(FRAMES_C2S[2])
                self.assertEqual(ws.recv(timeout=5), FRAMES_C2S[2])
                backend = hb.SERVER.lsp_backends[-1]
                session = hb.SERVER.lsp_sessions[-1]
            self.assertTrue(_wait_until(lambda: session.closed))
            audit = hb.SERVER.audit_lsp_session(session, backend)
            self.assertFalse(audit["ok"])
            self.assertEqual(audit["failureClass"], "lsp-bridge-drop")
            drop_pin = hb.LOG.events("hub.lsp.drop")[-1]["payload"]
            self.assertEqual(drop_pin["failureClass"], "lsp-bridge-drop")
            self.assertEqual(drop_pin["sessionId"], session.session_id)
        finally:
            hb.SERVER.attach_lsp_backend(hub_server.EchoLspBackend)

    def test_instance_backend_busy_refused_by_name(self):
        """Instance mode (V2's real-handle shape): a second concurrent
        connection is refused with close code 1013 / lsp-backend-busy."""
        instance = hub_server.EchoLspBackend()
        hb.SERVER.attach_lsp_backend(instance)
        try:
            with ws_connect(hb.WS_BASE + "/lsp") as first:
                first.send('{"jsonrpc":"2.0","method":"ping"}')
                first.recv(timeout=5)
                second = ws_connect(hb.WS_BASE + "/lsp")
                with self.assertRaises(ConnectionClosed) as ctx:
                    second.recv(timeout=5)
                self.assertEqual(ctx.exception.rcvd.code, 1013)
                self.assertIn("lsp-backend-busy",
                              ctx.exception.rcvd.reason)
                busy_pin = hb.LOG.events("hub.lsp.busy")[-1]["payload"]
                self.assertEqual(busy_pin["failureClass"], "lsp-backend-busy")
            # after the first hangs up, the instance is free again
            self.assertTrue(_wait_until(
                lambda: not hb.SERVER._lsp_instance_busy))
            with ws_connect(hb.WS_BASE + "/lsp") as third:
                third.send('{"jsonrpc":"2.0","method":"ping2"}')
                self.assertEqual(third.recv(timeout=5),
                                 '{"jsonrpc":"2.0","method":"ping2"}')
        finally:
            hb.SERVER.attach_lsp_backend(hub_server.EchoLspBackend)

    def test_unknown_ws_path_closed(self):
        ws = ws_connect(hb.WS_BASE + "/not-lsp")
        with self.assertRaises(ConnectionClosed) as ctx:
            ws.recv(timeout=5)
        self.assertEqual(ctx.exception.rcvd.code, 1008)


if __name__ == "__main__":
    unittest.main(verbosity=2)
