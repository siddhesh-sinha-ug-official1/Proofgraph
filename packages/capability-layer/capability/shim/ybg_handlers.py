"""ybg-lsp request handlers, part 1: capabilities-for-mode, initialize,
position helpers, the structure-only stub, hover, definition, references.
Split out SUB200 from ybg_lsp.py."""

import json
import os
import re

from .ybg_state import (MODE, STATE, STRUCTURE_LIKE, byte_col_to_char,
                        char_to_byte_col, negotiate_encoding, path_to_uri,
                        probe, send, uri_to_path)
from .ybg_ybc import line_text, run_ybc, scratch_file

# --------------------------------------------------------------------------
# Request handlers
# --------------------------------------------------------------------------

def caps_for_mode(chosen_encoding):
    if STRUCTURE_LIKE:
        return {
            "textDocumentSync": 1,
            "hoverProvider": True,          # advertised — but shallow (the zls shape)
            "definitionProvider": True,
            "referencesProvider": True,
            "documentSymbolProvider": True,
            "positionEncoding": chosen_encoding,
        }
    return {
        "textDocumentSync": 1,              # full sync on each change
        "hoverProvider": True,              # -> ybc query type
        "definitionProvider": True,         # -> ybc query def
        "referencesProvider": True,         # -> ybc query refs
        "documentSymbolProvider": True,     # -> ybc --emit=ast
        "completionProvider": {"triggerCharacters": ["."]},   # -> ybc doc
        "renameProvider": True,             # -> ybc query refs
        "diagnosticProvider": {"interFileDependencies": True,
                               "workspaceDiagnostics": False},
        "positionEncoding": chosen_encoding,
    }


def handle_initialize(msg):
    params = msg.get("params") or {}
    offered = ((params.get("capabilities") or {}).get("general") or {}) \
        .get("positionEncodings")
    STATE["encoding"] = negotiate_encoding(offered)
    root_uri = params.get("rootUri")
    if root_uri:
        STATE["root"] = uri_to_path(root_uri)
    if MODE == "compiler":
        cp, _ = run_ybc(["--version"], "capability.shim.doc.call")
        if cp is not None:
            m = re.search(r"ybc\s+(\S+)", cp.stdout)
            STATE["ybc_version"] = m.group(1) if m else "unknown"
        server_info = {"name": "ybg-lsp", "version": "ybc-%s" % STATE["ybc_version"]}
    else:
        server_info = {"name": "zg-structure-ls", "version": "0.9.0"}
    caps = caps_for_mode(STATE["encoding"])
    result = {"capabilities": caps, "serverInfo": server_info}
    probe("capability.shim.initialize", "output", result)
    send({"id": msg["id"], "result": result})


def doc_position(msg):
    p = msg["params"]
    uri = p["textDocument"]["uri"]
    line = p["position"]["line"] + 1
    lstr = line_text(uri, line)
    col = char_to_byte_col(lstr, p["position"]["character"])
    return uri, line, col


def query_scratch(uri):
    """Write the CURRENT doc text to a deterministic scratch file for ybc queries."""
    text = STATE["docs"].get(uri, "")
    return scratch_file("query", text)


def structure_stub(msg, method):
    probe("capability.shim.stub", "value",
          {"method": method, "result": None,
           "reason": "structure-only mode: ybc not consulted (own shallow analyzer)"})
    send({"id": msg["id"], "result": None})


def handle_hover(msg):
    if STRUCTURE_LIKE:
        return structure_stub(msg, "textDocument/hover")
    uri, line, col = doc_position(msg)
    path = query_scratch(uri)
    cp, _ = run_ybc(["query", "type", "--line", str(line), "--col", str(col),
                     "--root", STATE["root"] or os.path.dirname(uri_to_path(uri)),
                     path],
                    "capability.shim.query.type")
    try:
        os.unlink(path)
    except OSError:
        pass
    if cp is None or not cp.stdout.strip():
        send({"id": msg["id"], "result": None})
        return
    send({"id": msg["id"],
          "result": {"contents": {"kind": "markdown",
                                  "value": "```yaddabinggiberish\n%s\n```"
                                           % cp.stdout.strip()}}})


def handle_definition(msg):
    if STRUCTURE_LIKE:
        return structure_stub(msg, "textDocument/definition")
    uri, line, col = doc_position(msg)
    path = query_scratch(uri)
    cp, _ = run_ybc(["query", "def", "--line", str(line), "--col", str(col),
                     "--root", STATE["root"] or os.path.dirname(uri_to_path(uri)),
                     path],
                    "capability.shim.query.def")
    try:
        os.unlink(path)
    except OSError:
        pass
    if cp is None or not cp.stdout.strip():
        send({"id": msg["id"], "result": None})
        return
    d = json.loads(cp.stdout)
    lstr = line_text(d["file"], d["line"])
    char = byte_col_to_char(lstr, d["col"])
    send({"id": msg["id"],
          "result": {"uri": path_to_uri(d["file"]),
                     "range": {"start": {"line": d["line"] - 1, "character": char},
                               "end": {"line": d["line"] - 1, "character": char}}}})


def refs_for(msg):
    uri, line, col = doc_position(msg)
    path = query_scratch(uri)
    cp, _ = run_ybc(["query", "refs", "--line", str(line), "--col", str(col),
                     "--root", STATE["root"] or os.path.dirname(uri_to_path(uri)),
                     path],
                    "capability.shim.query.refs")
    try:
        os.unlink(path)
    except OSError:
        pass
    if cp is None or not cp.stdout.strip():
        return None
    return json.loads(cp.stdout)


def handle_references(msg):
    if STRUCTURE_LIKE:
        return structure_stub(msg, "textDocument/references")
    refs = refs_for(msg)
    if refs is None:
        send({"id": msg["id"], "result": None})
        return
    locations = []
    for r in refs:
        lstr = line_text(r["file"], r["line"])
        char = byte_col_to_char(lstr, r["col"])
        locations.append({"uri": path_to_uri(r["file"]),
                          "range": {"start": {"line": r["line"] - 1, "character": char},
                                    "end": {"line": r["line"] - 1, "character": char}}})
    send({"id": msg["id"], "result": locations})
