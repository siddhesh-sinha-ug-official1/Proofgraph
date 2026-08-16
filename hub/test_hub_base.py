"""Shared fixture + helpers for the backend-hub suite (SUB200 restructure).

Split out of hub/test_hub.py, which remains the runnable AGGREGATOR
(`python hub/test_hub.py` — run_demo/run_all invoke it by path).  The split
test modules (test_hub_seam / _query_verdict / _pins / _analyze / _lsp /
_truth_analysis / _fs_*) all stand on ONE shared stack built here lazily:
LOG + pipeline RESULT + a started HubServer on ephemeral ports.  Each split
module's setUpModule() calls ensure_stack(); the server is stopped once at
process exit (atexit), preserving the original module-fixture lifecycle.
"""
from __future__ import annotations

import atexit
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import pipeline as hub_pipeline  # noqa: E402
import server as hub_server      # noqa: E402

FIXTURE = (hub_pipeline.PACKAGES / "structure-extractor" / "fixtures" / "python")
SKELETON_CONFIG = {"roots": ["pkg.a"], "python_package": "pkg",
                   "pyright_mode": "none"}

LOG: hub_pipeline.HubLog = None
RESULT: dict = None
SERVER: hub_server.HubServer = None
BASE: str = None
WS_BASE: str = None

_started = False


def ensure_stack():
    """Build the shared suite stack exactly once (the original setUpModule)."""
    global _started, LOG, RESULT, SERVER, BASE, WS_BASE
    if _started:
        return
    LOG = hub_pipeline.HubLog()
    RESULT = hub_pipeline.run_pipeline(
        FIXTURE, extractor_config=SKELETON_CONFIG, log=LOG)
    SERVER = hub_server.HubServer(RESULT, log=LOG).start()
    BASE = f"http://127.0.0.1:{SERVER.http_port}"
    WS_BASE = f"ws://127.0.0.1:{SERVER.ws_port}"
    atexit.register(SERVER.stop)   # the original tearDownModule, at exit
    _started = True


# ---- tiny HTTP helpers ------------------------------------------------------

def http_get(path: str):
    """-> (status, headers, body_bytes); HTTP errors return their bodies."""
    try:
        with urllib.request.urlopen(BASE + path) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read()


def http_get_json(path: str):
    status, headers, body = http_get(path)
    return status, json.loads(body.decode("utf-8"))


def http_post_json(path: str, obj=None, raw: bytes | None = None):
    data = raw if raw is not None else json.dumps(obj).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


def http_get_json_at(base: str, path: str):
    """GET against an arbitrary hub base (Test11's fresh-server probes)."""
    try:
        with urllib.request.urlopen(base + path) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


def http_put_json(path: str, obj, base: str | None = None):
    req = urllib.request.Request((base or BASE) + path,
                                 data=json.dumps(obj).encode("utf-8"),
                                 method="PUT",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


def model_wall():
    return SERVER.pipeline["modelWall"]


def extractor_wall():
    return SERVER.pipeline["extractorWall"]


def model_events(probe_id):
    return [e for e in model_wall().pins.history() if e["probeId"] == probe_id]


def extractor_events(probe_id):
    return [e for e in extractor_wall().pins.history()
            if e["probeId"] == probe_id]


# ---- WS /lsp fixtures (Test08) ---------------------------------------------

FRAMES_C2S = [
    json.dumps({"jsonrpc": "2.0", "method": "textDocument/didOpen",
                "params": {"textDocument": {
                    "uri": "file:///demo/a.py", "languageId": "python",
                    "version": 1, "text": "VALUE = 'unicode: π∆'\n"}}},
               ensure_ascii=False),
    json.dumps({"jsonrpc": "2.0", "id": 7, "method": "textDocument/definition",
                "params": {"textDocument": {"uri": "file:///demo/a.py"},
                           "position": {"line": 0, "character": 0}}}),
    json.dumps({"jsonrpc": "2.0", "method": "textDocument/didChange",
                "params": {"textDocument": {"uri": "file:///demo/a.py",
                                            "version": 2},
                           "contentChanges": [{"text": "VALUE = 2\n"}]}}),
]

SERVER_TO_CLIENT_REQUEST = json.dumps(
    {"jsonrpc": "2.0", "id": 42, "method": "workspace/configuration",
     "params": {"items": [{"section": "python.analysis"}]}})

CLIENT_CONFIG_RESPONSE = json.dumps(
    {"jsonrpc": "2.0", "id": 42, "result": [{}]})


def _wait_until(predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return predicate()
