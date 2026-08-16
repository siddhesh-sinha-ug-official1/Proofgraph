#!/usr/bin/env python3
"""ybg-lsp — the reference LSP shim over the `ybc` compiler CLI (build prompt §7.6).

The ~50-line skeleton (read_msg / send / diagnostics_for + positionEncoding
negotiation) is preserved faithfully; around it, every internal lead of the
Probe Density Contract is emitted IN-BAND as a `$/probe` notification on stdout,
so the parent bus receives one deterministically ordered stream (probes and
responses share the same pipe — no cross-pipe races).

License posture (Operating Contract rule 10): this shim links NOTHING — it spawns
`ybc` as an out-of-process subprocess and consumes its JSON/text.

Runs standalone over stdio JSON-RPC (spawned by capability/spine.py by file
path; since the SUB200 split it adds the layer root to sys.path and imports
its sibling modules package-qualified — see the comment below the docstring).

Environment:
  YBG_LSP_YBC_CMD   JSON argv prefix for the compiler, e.g. ["python", ".../mock_ybc.py"]
  YBG_LSP_MODE      "compiler" (default) | "structure-only"
                    structure-only = the zls shape: advertises hover/def/refs, runs its
                    OWN shallow analyzer, never consults ybc → FAILS P2 by design.
  YBG_LSP_TMPDIR    scratch dir; files named check-<n>.ybg / query-<n>.ybg with a
                    per-session counter (deterministic — no random temp names).

ybc COLUMN UNITS: 1-based UTF-8 byte offsets. LSP's DEFAULT positionEncoding is
UTF-16 (the silent corruptor, Part I §1.6) — we advertise utf-8 when the client
offers it and do encoding-aware column math both directions.
"""

import os
import sys

# SUB200 restructure: the shim internals live in sibling modules of the
# capability.shim package; this file REMAINS the spawned entry (spine.py
# shim_argv spawns it by file path).  When run standalone the package is
# not on sys.path, so the layer root is added first; the wire behavior and
# every public name are unchanged.
if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))))

from capability.shim.ybg_state import (  # noqa: F401,E402  (re-exported)
    MODE, SEVERITY, STATE, STRUCTURE_LIKE, TMPDIR, YBC, byte_col_to_char,
    char_to_byte_col, negotiate_encoding, path_to_uri, probe, read_msg,
    send, uri_to_path)
from capability.shim.ybg_ybc import (  # noqa: F401,E402  (re-exported)
    diagnostics_for, line_text, map_ybc_diag, run_ybc, scratch_file)
from capability.shim.ybg_handlers import (  # noqa: F401,E402  (re-exported)
    caps_for_mode, doc_position, handle_definition, handle_hover,
    handle_initialize, handle_references, query_scratch, refs_for,
    structure_stub)
from capability.shim.ybg_symbols import (  # noqa: F401,E402  (re-exported)
    LSP_SYMBOL_KIND, handle_completion, handle_document_symbol,
    handle_rename)


# --------------------------------------------------------------------------
# Main loop — the skeleton's dispatch, faithful shape.
# --------------------------------------------------------------------------

def main():
    STATE["serving"] = True
    while True:
        msg = read_msg()
        if msg is None:
            break
        m = msg.get("method")
        if m == "initialize":
            handle_initialize(msg)
        elif m == "initialized":
            pass
        elif m == "textDocument/didOpen":
            d = msg["params"]["textDocument"]
            STATE["docs"][d["uri"]] = d["text"]
            diagnostics_for(d["uri"], d["text"])
        elif m == "textDocument/didChange":
            uri = msg["params"]["textDocument"]["uri"]
            STATE["docs"][uri] = msg["params"]["contentChanges"][-1]["text"]
            diagnostics_for(uri, STATE["docs"][uri])
        elif m == "textDocument/hover":
            handle_hover(msg)
        elif m == "textDocument/definition":
            handle_definition(msg)
        elif m == "textDocument/references":
            handle_references(msg)
        elif m == "textDocument/rename":
            handle_rename(msg)
        elif m == "textDocument/documentSymbol":
            handle_document_symbol(msg)
        elif m == "textDocument/completion":
            handle_completion(msg)
        elif m == "shutdown":
            send({"id": msg["id"], "result": None})
        elif m == "exit":
            break
        elif "id" in msg:
            # unknown request -> honest stub, a known gap not a mystery
            probe("capability.shim.stub", "value",
                  {"method": m, "result": None, "reason": "not yet wired"})
            send({"id": msg["id"], "result": None})
        # unknown notifications are ignored per LSP


if __name__ == "__main__":
    main()
