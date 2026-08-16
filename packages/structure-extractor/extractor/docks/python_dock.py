"""S2 · Python DOCK — SHIPPED end-to-end.

grimp (BSD-2-Clause) gives the turnkey module import graph — imports are
resolved BY CONSTRUCTION on the real graph, and we record that explicitly
rather than assuming it.  Pyright (MIT, subprocess) gives semantic def/ref →
function-grade `calls`/`inherits`.  Every candidate produces exactly one
ResolverDecision with a VERBATIM taxonomy reason (per-candidate detail lives in
the decision's `note`), and every decision is probed: that stream IS the dock's
honest ceiling.

Review-hardened behaviors (2026-07-20 adversarial pass):
  * every top-level package under the project root is analyzed by grimp, and a
    skipped imports sub-path or uncovered loose modules emit extractor.cap.applied
    (C3/C12 — no silent truncation of the relationship set);
  * duplicate (kind, src, dst) resolutions are rejected as X_DUP so resolved
    edges and resolved decisions stay 1:1 through assemble's dedup (C10);
  * the builtin check consults Pyright first when a backend is available — a
    project function shadowing a builtin name resolves normally (C7);
  * LSP errors/timeouts surface as U_BACKEND_ERROR/U_BACKEND_TIMEOUT leads,
    never as 'definition not found' (C8);
  * an anchor whose use-site has no owning node is REJECTED with X_NO_OWNER,
    never silently dropped (C2);
  * the HonestCeiling reports what THIS RUN could actually resolve; the full
    design lives in extra.designedResolves (C4).

SUB200 restructure: this module is now the FACADE (dock registry name stable).
The grimp sub-path lives in python_grimp.py, the Pyright sub-path in
python_pyright_path.py, shared constants + the effective ceiling in
python_ceiling.py.  The public surface here is unchanged.
"""
from __future__ import annotations

from ..capability import CapabilityHandle, TIER_CT
from ..ingest import SourceSet
from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from ..t1 import Anchor
from .base import Dock, DockResult, HonestCeiling, edges_from_decisions
from .pyright_backend import PyrightBackend
from .python_ceiling import (DESIGNED_RESOLVES, DYNAMIC_IMPORT_CALLEES,  # noqa: F401
                             PY_BUILTINS, STAGE, effective_ceiling)
from .python_grimp import grimp_imports, infer_packages, rel_parts
from .python_pyright_path import calls_and_inherits


class PythonDock(Dock):
    lang = "python"

    def __init__(self, package: str | None = None,
                 pyright_backend: PyrightBackend | None = None,
                 grimp_roots: list[str] | None = None):
        self.package = package
        self.pyright_backend = pyright_backend
        self.grimp_roots = grimp_roots or []

    # ------------------------------------------------------------------ ship
    def extract(self, source: SourceSet, handle: CapabilityHandle,
                nodes: list[SchemaNode], anchors: list[Anchor],
                bus: ProbeBus, cause: ProbeEvent | None = None) -> DockResult:
        decisions: list = []
        py_nodes = [n for n in nodes if n.lang == "python"]
        module_by_name = {n.name: n for n in py_nodes if n.kind == "module"}
        files = {f.path: f for f in source.files}
        # one non-rejected decision per (kind, src, dst): duplicates are X_DUP (C10)
        emitted_keys: set[tuple[str, str, str]] = set()

        # Assembly ruling 2: resolved edges are CT-only — S-tier lost
        # resolution rights (grimp included); at S every candidate is a lead.
        allow_grimp = handle.tier == TIER_CT
        allow_pyright = handle.tier == TIER_CT

        # ---- grimp sub-path: imports, module granularity -------------------
        packages = [self.package] if self.package else self._infer_packages(source)
        if not packages:
            bus.emit("extractor.cap.applied", STAGE, "decision", {
                "capName": "python.grimp.no-package",
                "limit": "grimp needs an importable package",
                "actual": "no package directory (with __init__.py) under the project root",
                "dropped": "imports sub-path (zero import candidates enumerated)"},
                cause=cause)
        loose = sorted(f.path for f in source.files
                       if len(self._rel_parts(f, source)) == 1)
        if loose:
            bus.emit("extractor.cap.applied", STAGE, "decision", {
                "capName": "python.grimp.loose-modules-not-covered",
                "limit": "grimp analyzes packages, not loose top-level modules",
                "actual": len(loose), "dropped": loose}, cause=cause)
        for pkg in packages:
            decisions += self._grimp_imports(bus, source, pkg, module_by_name,
                                             allow_grimp, handle.tier,
                                             emitted_keys, cause)

        # ---- pyright sub-path: calls/inherits, function granularity --------
        backend = self.pyright_backend
        if not allow_pyright:
            bus.emit("extractor.cap.applied", STAGE, "decision", {
                "capName": "python.pyright.tier-gate",
                "limit": "tier CT required for Pyright-grade resolution",
                "actual": handle.tier,
                "dropped": "calls/inherits resolution (candidates become leads)"}, cause=cause)
        decisions += self._calls_and_inherits(bus, source, py_nodes, anchors, files,
                                              allow_pyright, handle.tier,
                                              emitted_keys, cause)

        for d in decisions:
            bus.emit("extractor.t2.py.call.resolve.decision", STAGE, "decision",
                     d.to_dict(), cause=cause)
            if d.outcome == "rejected":
                bus.emit("extractor.t2.py.call.rejected", STAGE, "edge",
                         {"candidate": d.candidate.to_dict(), "reason": d.reason,
                          "note": d.note}, cause=cause)

        # Decision D2, recorded every run: the branch NOT taken and why.
        bus.emit("extractor.t2.py.scip.fallback", STAGE, "branch", {
            "considered": "scip-python", "chosen": "pyright-direct",
            "reason": ("scip-python lags current Pyright and its 2026 activity is "
                       "unconfirmed — Pyright-direct is the fallback-as-default (D2)")},
            cause=cause)

        edges = edges_from_decisions(decisions)
        for e in edges:
            bus.emit("extractor.t2.py.edge.provenance", STAGE, "value", {
                "edgeId": e.id, "tier": "T2", "extractor": e.provenance["extractor"],
                "resolver": e.resolver, "resolved": e.resolved}, cause=cause)

        ceiling = self._effective_ceiling(handle, packages, allow_grimp,
                                          allow_pyright, backend)
        bus.emit("extractor.t2.py.honest_ceiling", STAGE, "state", ceiling.to_dict(), cause=cause)
        return DockResult(edges=edges, decisions=decisions, ceiling=ceiling)

    # ---- delegates into the split modules (SUB200; behavior verbatim) ------
    @staticmethod
    def _rel_parts(f, source: SourceSet) -> tuple:
        return rel_parts(f, source)

    def _infer_packages(self, source: SourceSet) -> list[str]:
        return infer_packages(source)

    def _grimp_imports(self, bus, source, pkg, module_by_name, allow, tier,
                       emitted_keys, cause) -> list:
        return grimp_imports(bus, source, pkg, module_by_name, allow, tier,
                             emitted_keys, cause, self.grimp_roots)

    def _calls_and_inherits(self, bus, source, py_nodes, anchors, files,
                            allow_pyright, tier, emitted_keys, cause) -> list:
        return calls_and_inherits(bus, source, py_nodes, anchors, files,
                                  allow_pyright, tier, emitted_keys, cause,
                                  self.pyright_backend)

    def _effective_ceiling(self, handle, packages, allow_grimp, allow_pyright,
                           backend) -> HonestCeiling:
        return effective_ceiling(handle, packages, allow_grimp, allow_pyright,
                                 backend)
