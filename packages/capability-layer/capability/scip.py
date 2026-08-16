"""Stage G — SCIP index: the bulk "dump" LSP structurally cannot do (§7.8).

Emits a whole-repo index from the compiler's typed AST (`ybc --emit=ast`) across
the project AND its resolved deps, then ingests it for repo-wide goto/refs/
"list all symbols".

PARALLEL-BUILD SEAM: real SCIP is a protobuf format (schema/reader Apache-2.0 —
verify; we ingest the INDEX as data, never embed Sourcegraph the engine — rule 10).
This round the index is written as JSON with the same conceptual shape
(Document / Occurrence / SymbolInformation); swapping the serializer for the
protobuf reader changes no probe shape.
"""

from __future__ import annotations

import json
import os
import re
import subprocess

STAGE = "scip"


class ScipIndex:
    def __init__(self, documents, occurrences, symbols, path):
        self.documents = documents
        self.occurrences = occurrences
        self.symbols = symbols
        self.path = path


def _repo_files(root, ext):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for fn in sorted(filenames):
            if fn.endswith(ext):
                out.append(os.path.join(dirpath, fn))
    return out


def run(bus, profile: dict, repo_root: str, config: dict):
    """Emit + ingest one index. Returns ScipIndex or None if no AST surface exists."""
    files = _repo_files(repo_root, profile["fileExt"])
    documents, occurrences, symbols = [], [], {}

    for path in files:
        rel = os.path.relpath(path, repo_root).replace("\\", "/")
        cp = subprocess.run(list(config["ybc_argv"]) + ["--emit=ast",
                            "--format=json", path],
                            capture_output=True, text=True, encoding="utf-8",
                            timeout=30)
        if cp.returncode != 0:
            continue
        ast = json.loads(cp.stdout)
        doc_syms = []
        for s in ast.get("symbols", []):
            sym_id = f"ybg {rel} {s['name']}"
            doc_syms.append(sym_id)
            symbols[sym_id] = {"symbol": sym_id,
                               "signature": s.get("signature") or s.get("type"),
                               "kind": s["kind"]}
            occurrences.append({"symbol": sym_id,
                                "range": {"file": rel, "line": s["line"],
                                          "col": s["col"]},
                                "role": "definition"})
        documents.append({"relativePath": rel, "symbols": doc_syms})

    # reference occurrences: scan for known definition names at use sites
    def_names = {}
    for sym_id in symbols:
        name = sym_id.split(" ")[-1]
        def_names.setdefault(name, sym_id)
    for path in files:
        rel = os.path.relpath(path, repo_root).replace("\\", "/")
        with open(path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f.read().split("\n"), start=1):
                for m in re.finditer(r"\b(\w+)\b", line):
                    sym_id = def_names.get(m.group(1))
                    if sym_id is None:
                        continue
                    is_def = any(o["role"] == "definition"
                                 and o["symbol"] == sym_id
                                 and o["range"]["file"] == rel
                                 and o["range"]["line"] == i
                                 for o in occurrences)
                    if not is_def:
                        occurrences.append({"symbol": sym_id,
                                            "range": {"file": rel, "line": i,
                                                      "col": m.start() + 1},
                                            "role": "reference"})

    index_path = os.path.join(config["work_dir"], "scip_index.json")
    payload = {"documents": documents, "occurrences": occurrences,
               "symbols": list(symbols.values())}
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    cause = bus.emit("capability.scip.emit.call", "call",
                     {"invocation": "walk ybc --emit=ast over project + resolved deps "
                                    "(self-emitted; no off-the-shelf scip-ybg exists)",
                      "indexPath": index_path,
                      "bytes": os.path.getsize(index_path)}, stage=STAGE)
    for d in documents:
        bus.emit("capability.scip.document", "node", d, stage=STAGE, cause_id=cause)
    for o in occurrences:
        bus.emit("capability.scip.occurrence", "edge", o, stage=STAGE, cause_id=cause)
    for s in payload["symbols"]:
        bus.emit("capability.scip.symbolInfo", "node", s, stage=STAGE, cause_id=cause)
    bus.emit("capability.scip.ingest", "value",
             {"symbols": len(payload["symbols"]), "docs": len(documents),
              "occurrences": len(occurrences)}, stage=STAGE, cause_id=cause)

    return ScipIndex(documents, occurrences, payload["symbols"], index_path)
