"""ybg-lsp shared state + wire plumbing: env configuration, the STATE dict,
LSP framing (read_msg / send / $/probe emission), Windows-safe path<->uri,
and the encoding-aware column math.  Split out SUB200 from ybg_lsp.py (the
spawned entry, which re-exports this whole surface)."""

import json
import os
import re
import sys
import urllib.parse

# --------------------------------------------------------------------------
# Configuration (env; no argv so the spawn line stays trivial)
# --------------------------------------------------------------------------

YBC = json.loads(os.environ.get("YBG_LSP_YBC_CMD") or '["ybc"]')
MODE = os.environ.get("YBG_LSP_MODE", "compiler")
TMPDIR = os.environ.get("YBG_LSP_TMPDIR") or os.getcwd()

# structure-only = the zls shape (own analyzer, never consults ybc, publishes []).
# trickster     = the fake-green attack: publishes a CANNED error on every doc,
#                 hoping an undiscriminating P2 counts it. The battery must not.
STRUCTURE_LIKE = MODE in ("structure-only", "trickster")

STATE = {
    "seq": 0,          # shim-side probe sequence (rides inside each $/probe)
    "scratch": 0,      # deterministic scratch-file counter
    "encoding": "utf-16",
    "root": None,      # workspace root path
    "docs": {},        # uri -> text
    "ybc_version": None,
    "serving": False,  # True only under main(); in-process unit tests stay silent
}

SEVERITY = {"error": 1, "warning": 2, "info": 3, "hint": 4}


# --------------------------------------------------------------------------
# Wire framing — the skeleton's read_msg / send, instrumented.
# --------------------------------------------------------------------------

def read_msg(stream=None):
    """LSP framing: 'Content-Length: N\\r\\n\\r\\n<json>'. Returns None on EOF/short body.

    Tolerates a lowercase header and a dropped '\\r' (bare '\\n' line endings)."""
    stream = stream or sys.stdin.buffer
    length = None
    raw_header = b""
    while True:
        line = stream.readline()
        raw_header += line
        if line == b"":
            return None  # EOF
        if line in (b"\r\n", b"\n"):
            break
        if line.lower().startswith(b"content-length:"):
            try:
                length = int(line.split(b":", 1)[1])
            except ValueError:
                return None
    if length is None:
        return None
    body = b""
    while len(body) < length:
        chunk = stream.read(length - len(body))
        if not chunk:
            return None  # body shorter than declared
        body += chunk
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    probe("capability.shim.readMsg", "call",
          {"raw": raw_header.decode("utf-8", "replace"),
           "parsed": parsed})
    return parsed


def send(msg):
    """Write one server→client message. Non-probe messages get a shim.send lead first."""
    full = {"jsonrpc": "2.0"}
    full.update(msg)
    if full.get("method") != "$/probe":
        probe("capability.shim.send", "call", {"json": full})
    data = json.dumps(full).encode("utf-8")
    sys.stdout.buffer.write(b"Content-Length: %d\r\n\r\n" % len(data))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def probe(probe_id, kind, payload, cause=None):
    """Emit one lead in-band. Returns a shim-side cause token."""
    STATE["seq"] += 1
    token = "shim:%s#%d" % (probe_id, STATE["seq"])
    if STATE["serving"]:  # unit tests import this module; only a live server emits
        send({"method": "$/probe",
              "params": {"probeId": probe_id, "kind": kind, "payload": payload,
                         "shimSeq": STATE["seq"], "cause": cause}})
    return token


# --------------------------------------------------------------------------
# Paths / URIs (Windows-safe)
# --------------------------------------------------------------------------

def uri_to_path(uri):
    p = urllib.parse.unquote(urllib.parse.urlparse(uri).path)
    if re.match(r"^/[A-Za-z]:", p):  # /A:/x/y -> A:/x/y
        p = p[1:]
    return os.path.normpath(p)


def path_to_uri(path):
    p = os.path.abspath(path).replace("\\", "/")
    # D-dedup U4/U8 (round-2026-08-16): restore the V1 lowercase-drive fix that
    # was already present in the spine-side helper (capability/spine_wire.py) —
    # this shim had drifted without it, so on Windows it published mixed-case
    # drive letters that pyright (which normalizes `A:` -> `a:`) would not
    # string-match back.  Symmetric with uri_to_path above (which also handles
    # Windows drives), keeping shim-published locations equal to the URIs the
    # client normalizes into.
    if re.match(r"^[A-Za-z]:", p):
        p = p[0].lower() + p[1:]
    if not p.startswith("/"):
        p = "/" + p
    return "file://" + urllib.parse.quote(p)


# --------------------------------------------------------------------------
# Encoding-aware column math (the single most bug-prone lines — Part I §1.6)
# --------------------------------------------------------------------------

def byte_col_to_char(line_text, byte_col_1based):
    """ybc byte column (1-based) -> LSP character in the NEGOTIATED encoding (0-based)."""
    if STATE["encoding"] == "utf-8":
        return byte_col_1based - 1  # LSP utf-8 characters ARE byte offsets
    prefix = line_text.encode("utf-8")[:byte_col_1based - 1].decode("utf-8", "replace")
    return len(prefix.encode("utf-16-le")) // 2


def char_to_byte_col(line_text, char_0based):
    """LSP character (negotiated encoding, 0-based) -> ybc byte column (1-based)."""
    if STATE["encoding"] == "utf-8":
        return char_0based + 1
    units = 0
    nbytes = 0
    for ch in line_text:
        if units >= char_0based:
            break
        units += len(ch.encode("utf-16-le")) // 2
        nbytes += len(ch.encode("utf-8"))
    return nbytes + 1


def negotiate_encoding(client_offered):
    """Prefer utf-8; the LSP default (and mandatory fallback) is utf-16."""
    offered = list(client_offered or [])
    chosen = "utf-8" if "utf-8" in offered else "utf-16"
    probe("capability.shim.encoding.negotiate", "decision",
          {"clientOffered": offered or ["<none — LSP default utf-16>"], "chosen": chosen})
    return chosen
