"""S2 · Python DOCK — the grimp sub-path: imports, module granularity.

grimp (BSD-2-Clause) gives the turnkey module import graph — imports are
resolved BY CONSTRUCTION on the real graph, and we record that explicitly
rather than assuming it.  Split from python_dock.py (SUB200 restructure);
python_dock.py stays the import surface (facade).
"""
from __future__ import annotations

from pathlib import Path

from ..ingest import SourceSet
from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from . import reasons as R
from .base import CandidateEdge, decide_rejected, decide_resolved, decide_unresolved
from .python_ceiling import STAGE


def rel_parts(f, source: SourceSet) -> tuple:
    try:
        return f.abspath.resolve().relative_to(Path(source.project_root).resolve()).parts
    except ValueError:
        return (f.path,)


def infer_packages(source: SourceSet) -> list[str]:
    """EVERY top-level package under the project root (C3) — not just the
    first one found."""
    pkgs = set()
    proot = Path(source.project_root)
    for f in source.files:
        parts = rel_parts(f, source)
        if len(parts) > 1 and (proot / parts[0] / "__init__.py").exists():
            pkgs.add(parts[0])
    return sorted(pkgs)


def grimp_imports(bus: ProbeBus, source: SourceSet, pkg: str,
                  module_by_name: dict[str, SchemaNode], allow: bool,
                  tier: str, emitted_keys: set, cause: ProbeEvent | None,
                  grimp_roots: list[str]) -> list:
    import grimp
    decisions: list = []
    req = bus.emit("extractor.backend.grimp.req", STAGE, "call", {"package": pkg}, cause=cause)
    bus.emit("extractor.t2.py.grimp.build", STAGE, "call",
             {"package": pkg, "options": {"include_external_packages": True,
                                          "cache_dir": None}}, cause=req)
    import sys
    sys.path.insert(0, source.project_root)
    try:
        graph = grimp.build_graph(pkg, include_external_packages=True, cache_dir=None)
    finally:
        sys.path.remove(source.project_root)
    modules = sorted(graph.modules)
    pairs = sorted((src, dst) for src in modules
                   for dst in graph.find_modules_directly_imported_by(src))
    bus.emit("extractor.backend.grimp.resp", STAGE, "call",
             {"modules": modules, "importPairs": [list(p) for p in pairs]}, cause=req)
    for m in modules:
        bus.emit("extractor.t2.py.grimp.module", STAGE, "node",
                 {"module": m, "inT1NodeSet": m in module_by_name}, cause=req)

    for src, dst in pairs:
        ev = bus.emit("extractor.t2.py.grimp.import.candidate", STAGE, "edge",
                      {"srcModule": src, "dstModule": dst}, cause=req)
        src_node = module_by_name.get(src)
        if src_node is None:
            cand = CandidateEdge("imports", f"<not-ingested:{src}>", dst,
                                 {"modulePath": dst}, {"file": src, "byteStart": 0, "byteEnd": 0},
                                 "grimp")
            decisions.append(decide_rejected(
                cand, R.X_SRC_OUTSIDE, note=f"{src} — e.g. an excluded __init__"))
            continue
        span = {"file": src_node.span.file, "byteStart": 0, "byteEnd": 0}
        cand = CandidateEdge("imports", src_node.id, dst, {"modulePath": dst}, span, "grimp")
        dst_node = module_by_name.get(dst)
        if not allow:
            decisions.append(decide_unresolved(
                cand, R.U_TIER_G if tier == "G" else R.U_TIER_CAP,
                note=f"grimp candidate enumerated; resolution forbidden at tier {tier}"))
        elif dst_node is not None:
            key = ("imports", src_node.id, dst_node.id)
            if key in emitted_keys:
                decisions.append(decide_rejected(cand, R.X_DUP,
                                                 note=f"{src}->{dst} already emitted"))
                continue
            emitted_keys.add(key)
            d = decide_resolved(cand, dst_node.id, R.R_GRIMP, "grimp")
            decisions.append(d)
            bus.emit("extractor.t2.py.grimp.import.resolved", STAGE, "decision", {
                "srcId": src_node.id, "dstId": dst_node.id, "resolved": True,
                "resolver": "grimp"}, cause=ev)
        elif dst.startswith(pkg + ".") or dst == pkg:
            decisions.append(decide_rejected(
                cand, R.X_TARGET_NOT_PROMOTED, note=f"target {dst}"))
        else:
            decisions.append(decide_rejected(
                cand, R.X_OUTPROJ, note=f"external package {dst}"))

    # grimp's own reachability answers, kept as a T3 cross-check (not primary)
    for root in grimp_roots:
        if root in graph.modules:
            downstream = sorted(graph.find_downstream_modules(root))
            bus.emit("extractor.t2.py.grimp.reachability", STAGE, "value", {
                "query": f"find_downstream_modules({root!r})",
                "result": downstream}, cause=req)
    return decisions
