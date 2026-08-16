"""Round WC-W8 — didChange textDocument version is a per-uri MONOTONIC
counter, not a hardcoded 2.  Prior code stamped version=2 on every
did_change; probe waits baked the constant in, so a second did_change on the
same uri would have collided with the first's version on real servers that
stamp publishDiagnostics with the request version.

The counter lives on the client (self.doc_versions[uri]) so the shim/server
stays whatever it always was; this gate exercises the CLIENT bytes on the
wire without needing a real LSP.  It fabricates a minimal LspClient handle
(no subprocess) and captures the JSON-RPC frames the notification() call
would have sent.
"""

from __future__ import annotations

import io
import os
import unittest

from capability import spine
from capability.probes import ProbeBus


class _FakeProc:
    """Just enough of subprocess.Popen for spine_wire.write_framed."""

    def __init__(self):
        self.stdin = io.BytesIO()
        # poll() is checked in a few places; return None to signal alive.
    def poll(self):
        return None


def _make_client():
    bus = ProbeBus()
    argv = ["nonexistent-lsp"]              # never spawned by this test
    client = spine.LspClient(bus, argv=argv, server_name="test-w8",
                             language_id="python")
    client.proc = _FakeProc()
    # skip lifecycle transitions: just make the notification path usable
    client.state = "alive"
    return client


def _sent_frames(client):
    raw = client.proc.stdin.getvalue()
    frames = []
    i = 0
    while i < len(raw):
        # each frame: "Content-Length: N\r\n\r\n" + N bytes of JSON
        j = raw.index(b"\r\n\r\n", i) + 4
        header = raw[i:j].decode("ascii", "replace")
        n = int(header.split("Content-Length:")[1].split("\r\n")[0].strip())
        body = raw[j:j + n]
        import json
        frames.append(json.loads(body))
        i = j + n
    return frames


class TestDidChangeVersionsMonotonic(unittest.TestCase):

    def test_did_open_seeds_version_1_and_each_did_change_increments(self):
        client = _make_client()
        uri = "file:///tmp/a.py"

        client.did_open(uri, "x = 1\n")
        client.did_change(uri, "x = 2\n")
        client.did_change(uri, "x = 3\n")

        # per-uri counter tracks the last stamped version
        self.assertEqual(client.doc_versions[uri], 3)

        frames = _sent_frames(client)
        opens = [f for f in frames if f.get("method") == "textDocument/didOpen"]
        changes = [f for f in frames if f.get("method") == "textDocument/didChange"]
        self.assertEqual(len(opens), 1, "one didOpen")
        self.assertEqual(len(changes), 2, "two didChange")
        # LSP-canonical shape: didOpen version 1, didChange 2 then 3 — was
        # a HARDCODED 2 on both didChange under the pre-W8 code.
        self.assertEqual(opens[0]["params"]["textDocument"]["version"], 1)
        self.assertEqual(changes[0]["params"]["textDocument"]["version"], 2)
        self.assertEqual(changes[1]["params"]["textDocument"]["version"], 3)

    def test_two_uris_have_independent_counters(self):
        client = _make_client()
        u1 = "file:///tmp/a.py"
        u2 = "file:///tmp/b.py"

        client.did_open(u1, "a\n")
        client.did_open(u2, "b\n")
        client.did_change(u1, "aa\n")
        client.did_change(u1, "aaa\n")
        client.did_change(u2, "bb\n")

        self.assertEqual(client.doc_versions[u1], 3)
        self.assertEqual(client.doc_versions[u2], 2)

        frames = _sent_frames(client)
        u1_changes = [f["params"]["textDocument"]["version"] for f in frames
                      if f.get("method") == "textDocument/didChange"
                      and f["params"]["textDocument"]["uri"] == u1]
        u2_changes = [f["params"]["textDocument"]["version"] for f in frames
                      if f.get("method") == "textDocument/didChange"
                      and f["params"]["textDocument"]["uri"] == u2]
        self.assertEqual(u1_changes, [2, 3])
        self.assertEqual(u2_changes, [2])


if __name__ == "__main__":
    unittest.main()
