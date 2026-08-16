"""ybg-lsp request handlers, part 2: rename, documentSymbol, completion.
Split out SUB200 from ybg_lsp.py."""

import json
import os
import re

from .ybg_state import (STATE, STRUCTURE_LIKE, byte_col_to_char,
                        char_to_byte_col, path_to_uri, probe, send)
from .ybg_ybc import line_text, run_ybc
from .ybg_handlers import doc_position, query_scratch, refs_for, structure_stub

def handle_rename(msg):
    if STRUCTURE_LIKE:
        return structure_stub(msg, "textDocument/rename")
    uri, line, col = doc_position(msg)
    # identify the old name so ranges cover it fully
    lstr = line_text(uri, line)
    old = None
    char0 = msg["params"]["position"]["character"]
    for m in re.finditer(r"\w+", lstr):
        # positions are in negotiated encoding; for our repos names are ASCII so
        # char offsets == byte offsets — convert defensively anyway
        start_char = byte_col_to_char(lstr, len(lstr[:m.start()].encode("utf-8")) + 1)
        end_char = byte_col_to_char(lstr, len(lstr[:m.end()].encode("utf-8")) + 1)
        if start_char <= char0 < end_char:
            old = m.group(0)
            break
    refs = refs_for(msg)
    if refs is None or old is None:
        send({"id": msg["id"], "result": None})
        return
    new_name = msg["params"]["newName"]
    changes = {}
    for r in refs:
        lt = line_text(r["file"], r["line"])
        start = byte_col_to_char(lt, r["col"])
        end = byte_col_to_char(lt, r["col"] + len(old.encode("utf-8")))
        changes.setdefault(path_to_uri(r["file"]), []).append(
            {"range": {"start": {"line": r["line"] - 1, "character": start},
                       "end": {"line": r["line"] - 1, "character": end}},
             "newText": new_name})
    send({"id": msg["id"], "result": {"changes": changes}})


LSP_SYMBOL_KIND = {"function": 12, "variable": 13, "import": 2}


def handle_document_symbol(msg):
    uri = msg["params"]["textDocument"]["uri"]
    text = STATE["docs"].get(uri, "")
    if STRUCTURE_LIKE:
        # our "own analyzer": a regex — real nav-ish output, zero type truth
        syms = []
        for i, line in enumerate(text.split("\n")):
            m = re.match(r"\s*fn\s+(\w+)", line)
            if m:
                syms.append({"name": m.group(1), "kind": 12,
                             "location": {"uri": uri,
                                          "range": {"start": {"line": i, "character": 0},
                                                    "end": {"line": i, "character": 0}}}})
        send({"id": msg["id"], "result": syms})
        return
    path = query_scratch(uri)
    cp, _ = run_ybc(["--emit=ast", "--format=json", path],
                    "capability.shim.doc.call")
    try:
        os.unlink(path)
    except OSError:
        pass
    if cp is None:
        send({"id": msg["id"], "result": None})
        return
    ast = json.loads(cp.stdout)
    syms = []
    for s in ast.get("symbols", []):
        lstr = line_text(uri, s["line"])
        char = byte_col_to_char(lstr, s["col"])
        syms.append({"name": s["name"], "kind": LSP_SYMBOL_KIND.get(s["kind"], 13),
                     "location": {"uri": uri,
                                  "range": {"start": {"line": s["line"] - 1,
                                                      "character": char},
                                            "end": {"line": s["line"] - 1,
                                                    "character": char}}}})
    send({"id": msg["id"], "result": syms})


def handle_completion(msg):
    if STRUCTURE_LIKE:
        return structure_stub(msg, "textDocument/completion")
    uri = msg["params"]["textDocument"]["uri"]
    line = msg["params"]["position"]["line"] + 1
    lstr = line_text(uri, line)
    char0 = msg["params"]["position"]["character"]
    byte_end = char_to_byte_col(lstr, char0) - 1
    prefix = lstr.encode("utf-8")[:byte_end].decode("utf-8", "replace")
    m = re.search(r"(\w+)\.$", prefix)
    if not m:
        send({"id": msg["id"], "result": []})
        return
    module = m.group(1)
    cp, _ = run_ybc(["doc", "--format=json", module], "capability.shim.doc.call")
    if cp is None:
        send({"id": msg["id"], "result": []})
        return
    doc = json.loads(cp.stdout)
    items = [{"label": f["name"], "kind": 3, "detail": f["signature"],
              "documentation": f["doc"]}
             for f in (doc.get("modules", {}).get(module, {}) or {}).get("functions", [])]
    send({"id": msg["id"], "result": items})
