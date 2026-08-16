"""S2 · Python DOCK — the Pyright sub-path: calls/inherits, function grade.

Pyright (MIT, subprocess) gives semantic def/ref → function-grade
`calls`/`inherits`.  Every candidate produces exactly one ResolverDecision
with a VERBATIM taxonomy reason, and every decision is probed.  Split from
python_dock.py (SUB200 restructure); python_dock.py stays the facade.
"""
from __future__ import annotations

from pathlib import Path

from ..ingest import SourceSet
from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from ..t1 import Anchor
from . import reasons as R
from .base import (CandidateEdge, decide_rejected, decide_resolved,
                   decide_unresolved, innermost_owner, node_at)
from .pyright_backend import (BackendTimeout, LspError,
                              byte_offset_to_position, position_to_byte_offset)
from .python_ceiling import DYNAMIC_IMPORT_CALLEES, PY_BUILTINS, STAGE


def calls_and_inherits(bus: ProbeBus, source: SourceSet,
                       py_nodes: list[SchemaNode], anchors: list[Anchor],
                       files: dict, allow_pyright: bool, tier: str,
                       emitted_keys: set, cause: ProbeEvent | None,
                       backend) -> list:
    decisions: list = []
    py_anchors = [a for a in anchors if a.lang == "python" and a.anchor_kind in ("call", "base")]

    def finish(d):
        """Duplicate-collapse gate (C10): one non-rejected decision per key."""
        if d.outcome != "rejected":
            key = (d.candidate.kind, d.candidate.srcId, d.boundDstId)
            if key in emitted_keys:
                d = decide_rejected(d.candidate, R.X_DUP,
                                    note=f"same (kind,src,dst) already decided: {d.outcome}")
            else:
                emitted_keys.add(key)
        decisions.append(d)

    for a in sorted(py_anchors, key=lambda a: (a.file, a.byte_start, a.anchor_kind)):
        kind = "inherits" if a.anchor_kind == "base" else "calls"
        span = {"file": a.file, "byteStart": a.byte_start, "byteEnd": a.byte_end}
        base_name = a.target_text.rsplit(".", 1)[-1].rsplit("(", 1)[0].strip()

        owner = innermost_owner(py_nodes, a.file, a.byte_start)
        if owner is None:
            # never a silent drop (C2): the anchor becomes a probed rejection
            cand = CandidateEdge(kind, "<no-owner>", a.target_text, None, span, "pyright")
            finish(decide_rejected(cand, R.X_NO_OWNER,
                                   note=f"{a.file}@{a.byte_start}"))
            continue

        if a.anchor_kind == "call":
            ev = bus.emit("extractor.t2.py.call.candidate", STAGE, "edge", {
                "srcId": owner.id, "calleeName": a.target_text, "useSiteSpan": span},
                cause=cause)
        else:
            ev = bus.emit("extractor.t2.py.inherits.candidate", STAGE, "edge", {
                "classId": owner.id, "baseName": a.target_text}, cause=cause)

        # dynamic-import call sites are `imports` leads, not calls
        if a.anchor_kind == "call" and a.target_text in DYNAMIC_IMPORT_CALLEES:
            cand = CandidateEdge("imports", owner.id, "<dynamic-import>",
                                 {"callee": a.target_text}, span, "pyright")
            finish(decide_unresolved(cand, R.U_DYNIMPORT))
            continue

        cand = CandidateEdge(kind, owner.id, a.target_text,
                             {"queryByteOffset": a.extra.get("queryByteOffset")},
                             span, "pyright")

        if a.extra.get("dynamic"):
            cand.dstName = "<dynamic>"
            finish(decide_unresolved(cand, R.U_DYNAMIC))
            continue

        bare_builtin = "." not in a.target_text and base_name in PY_BUILTINS

        if not allow_pyright or backend is None:
            # no resolver consulted this run: builtin rejection stays a
            # NAME HEURISTIC and says so; everything else is a lead
            if bare_builtin:
                finish(decide_rejected(cand, R.X_BUILTIN,
                                       note="name-heuristic (no backend consulted)"))
            elif not allow_pyright:
                finish(decide_unresolved(
                    cand, R.U_TIER_G if tier == "G" else R.U_TIER_CAP,
                    note=f"Pyright path requires CT; tier is {tier}"))
            else:
                finish(decide_unresolved(cand, R.U_STUB,
                                         note="no Pyright backend configured"))
            continue

        # Pyright is consulted FIRST — a project function shadowing a
        # builtin name must resolve to the project definition (C7).
        f = files.get(a.file)
        qoff = a.extra.get("queryByteOffset", a.byte_start)
        line, ch = byte_offset_to_position(f.data, qoff)
        invoke = bus.emit("extractor.t2.py.pyright.invoke", STAGE, "call",
                          {"file": a.file, "request": f"definition@{line}:{ch}"}, cause=ev)
        bus.emit("extractor.backend.pyright.req", STAGE, "call", {
            "file": a.file, "position": {"line": line, "character": ch},
            "method": "textDocument/definition"}, cause=invoke)
        try:
            locs = backend.definitions(a.file, line, ch)
        except BackendTimeout as t:
            bus.emit("extractor.backend.timeout", STAGE, "error",
                     {"backend": t.backend, "cmd": t.cmd, "ms": t.ms}, cause=invoke)
            bus.emit("extractor.error.caught", STAGE, "error",
                     {"stage": STAGE, "exception": str(t), "sourceSpan": span}, cause=invoke)
            finish(decide_unresolved(cand, R.U_BACKEND_TIMEOUT))
            continue
        except LspError as le:
            # an LSP error is NOT 'no definition' (C8)
            bus.emit("extractor.error.caught", STAGE, "error",
                     {"stage": STAGE, "exception": str(le), "sourceSpan": span}, cause=invoke)
            bus.emit("extractor.backend.pyright.resp", STAGE, "call",
                     {"result": {"error": {"code": le.code, "message": le.lsp_message}},
                      "mode": backend.mode}, cause=invoke)
            finish(decide_unresolved(cand, R.U_BACKEND_ERROR,
                                     note=f"LSP error {le.code}"))
            continue
        bus.emit("extractor.backend.pyright.resp", STAGE, "call",
                 {"result": locs, "mode": backend.mode}, cause=invoke)

        if locs is None:
            finish(decide_unresolved(cand, R.U_NODEF,
                                     note="no recorded response for this position"))
            continue
        if not locs:
            if bare_builtin:
                finish(decide_rejected(cand, R.X_BUILTIN,
                                       note="no location; name matches a builtin"))
            else:
                finish(decide_unresolved(cand, R.U_NODEF))
            continue
        loc = locs[0]
        if loc.get("external"):
            if bare_builtin:
                finish(decide_rejected(cand, R.X_BUILTIN,
                                       note="Pyright bound to typeshed/builtins"))
            else:
                finish(decide_unresolved(cand, R.U_OUTSIDE,
                                         note=f"external: {Path(loc['file']).name}"))
            continue
        dst_file = files.get(loc["file"])
        if dst_file is None:
            finish(decide_unresolved(cand, R.U_OUTSIDE,
                                     note=f"definition file not ingested: {loc['file']}"))
            continue
        dst_off = position_to_byte_offset(dst_file.data, loc["line"], loc["character"])
        dst_node = node_at(py_nodes, loc["file"], dst_off)
        if dst_node is None:
            finish(decide_unresolved(cand, R.U_OUTSIDE,
                                     note="definition position not inside any T1 node"))
            continue
        if dst_node.id == owner.id and kind == "calls":
            finish(decide_rejected(cand, R.X_SELF))
            continue
        cand.dstHint = {"pyrightDef": {"file": loc["file"], "line": loc["line"],
                                       "character": loc["character"]}}
        finish(decide_resolved(cand, dst_node.id, R.R_PYRIGHT, "pyright"))
        bus.emit("extractor.t2.py.pyright.def", STAGE, "node", {
            "name": dst_node.name,
            "span": {"file": loc["file"], "line": loc["line"],
                     "character": loc["character"]}}, cause=invoke)
        bus.emit("extractor.t2.py.pyright.ref", STAGE, "edge", {
            "useSiteSpan": span,
            "boundDefSpan": {"file": loc["file"], "line": loc["line"],
                             "character": loc["character"]}}, cause=invoke)
    return decisions
