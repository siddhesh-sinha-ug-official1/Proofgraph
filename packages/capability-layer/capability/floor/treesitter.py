"""Stage F — the tree-sitter floor: the tier you never fall below (depth G = schema T1).

PARALLEL-BUILD SEAM: the real tree-sitter runtime (MIT; verify each grammar's own
LICENSE) is a linked C library loaded via the `tree_sitter` package. This round it
is stubbed by StubTreeSitterRuntime — a pure-Python line-based parser that
implements the same *interface shape* the Handle exposes (parse(text) -> Tree of
nodes with type/named/byte spans; node-types.json enumeration; highlights
captures). Swapping in the real runtime changes ONLY `load_grammar`.

The floor build is ATTEMPTED for every language regardless of what the deeper
stages produce (build prompt §5.2); a language whose fileExt has no stub
grammar (python, lean) gets NO floor — a logged bound (no G fallback), stated
verbatim in the discovery grammar lead. Its goto is a same-file NAME
HEURISTIC — explicitly a lead, not an edge: resolved MUST be false.
"""

from __future__ import annotations

import os
import re
import time

STAGE = "floor"

from .ts_runtime import TSNode, Tree, _LineGrammar, _tok  # noqa: F401
from .ts_grammars import (  # noqa: F401  (re-exported public surface)
    AwkGrammar, StubTreeSitterRuntime, YbgGrammar)


class FloorHandle:
    """The tree-sitter-backed part of the Handle (build prompt §5.4)."""

    def __init__(self, grammar, extractor):
        self.grammar = grammar
        self.extractor = extractor
        self.tier = "G"
        self.kind = "treesitter"
        self.nodeTypes = list(grammar.node_types)

    def parse(self, text):
        return self.grammar.parse(text)


SYMBOL_TYPES = {"function_definition": "function", "let_declaration": "variable",
                "func_definition": "function"}


def symbols_of(tree):
    out = []
    for n in tree.root_node.walk():
        kind = SYMBOL_TYPES.get(n.type)
        if kind:
            m = re.search(r"(?:fn|let|function)\s+(\w+)", n.text)
            if m:
                out.append({"name": m.group(1), "kind": kind,
                            "span": {"byteStart": n.start_byte,
                                     "byteEnd": n.end_byte}})
    return out


def build(bus, profile: dict, repo_root: str) -> tuple:
    """Build the floor for this language. Returns (FloorHandle|None, buildNanos)."""
    t0 = time.perf_counter_ns()
    runtime = StubTreeSitterRuntime()
    grammar = runtime.load_grammar(profile["fileExt"])
    if grammar is None:
        return None, time.perf_counter_ns() - t0

    extractor = f"{grammar.name}@{grammar.version}"
    cause = bus.emit("capability.floor.nodeTypes", "value", grammar.node_types,
                     stage=STAGE)
    bus.emit("capability.floor.highlights", "value", grammar.highlights,
             stage=STAGE, cause_id=cause)

    # parse the representative file (first file with the ext, sorted)
    main_file = None
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames.sort()
        for fn in sorted(filenames):
            if fn.endswith(profile["fileExt"]):
                main_file = os.path.join(dirpath, fn)
                break
        if main_file:
            break

    handle = FloorHandle(grammar, extractor)
    if main_file:
        with open(main_file, "r", encoding="utf-8") as f:
            text = f.read()
        tree = handle.parse(text)
        bus.emit("capability.floor.parse", "call",
                 {"textBytes": len(text.encode("utf-8")),
                  "errorNodes": tree.count("ERROR"),
                  "missingNodes": 0,
                  "rootType": tree.root_node.type},
                 stage=STAGE, cause_id=cause)
        syms = symbols_of(tree)
        for s in syms:
            bus.emit("capability.floor.symbol", "node", s, stage=STAGE,
                     cause_id=cause)
        # same-file name-heuristic goto: a LEAD, not an edge (resolved MUST be
        # false). EVERY matching call site is emitted — no silent top-N.
        def_names = {s["name"] for s in syms}
        for n in tree.root_node.walk():
            if n.type in ("call_expression", "identifier", "statement"):
                m = re.search(r"(\w+)\s*\(", n.text)
                if m and m.group(1) in def_names:
                    bus.emit("capability.floor.gotoHeuristic", "edge",
                             {"name": m.group(1),
                              "span": {"byteStart": n.start_byte,
                                       "byteEnd": n.end_byte},
                              "resolved": False,
                              "why": "same-file name match; single-file heuristic "
                                     "cannot resolve imports"},
                             stage=STAGE, cause_id=cause)

    bus.emit("capability.floor.tier", "value",
             {"depthTier": "G", "schemaTier": "T1"}, stage=STAGE, cause_id=cause)
    return handle, time.perf_counter_ns() - t0
