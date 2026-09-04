"""The cell: S0 ingest → S1 T1 → S2 docks → S3 assemble → S4 T3 → S5 output.

ExtractorCell is the densely instrumented façade of this round:
  probeCatalog() — every available lead (Probe Density §3)
  dump()         — the ENTIRE internal state at the moment of call (§4)
  tap(id, fn)    — subscribe to one live lead (§4)
  history()      — the ordered probe stream, deterministic by logicalClock (§4/§6)
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from .assemble import assemble
from .boundary import check_boundary
from .capability import stub_capability
from .docks import ALL_DOCKS, DockResult
from .ingest import SourceSet, ingest
# PipelineConfig + HONEST_GAPS live in pipeline_config.py, dock construction
# in pipeline_docks.py (SUB200 restructure) — both re-exported here (facade).
from .pipeline_config import HONEST_GAPS, PipelineConfig  # noqa: F401
from .pipeline_docks import make_dock
from .probe import ProbeBus, ProbeEvent, StageTimer, make_bus
from .t1 import extract_t1
from .t3 import compute_t3


class ExtractorCell:
    def __init__(self, config: PipelineConfig | None = None):
        self.config = config or PipelineConfig()
        self.bus: ProbeBus = make_bus()
        self._state: dict[str, Any] = {}

    # ---- introspection entry points (Probe Density §3–4) -------------------
    def probeCatalog(self) -> list[dict]:
        return self.bus.probe_catalog()

    def dump(self) -> dict:
        """The ENTIRE internal state at the moment of call."""
        s = self._state
        return {
            "config": {
                "roots": list(self.config.roots),
                "pythonPackage": self.config.python_package,
                "pyrightMode": self.config.pyright_mode,
                "johnsonLengthBound": self.config.johnson_length_bound,
            },
            "sourcesets": {lang: {"files": [f.path for f in ss.files],
                                  "projectRoot": ss.project_root,
                                  "anchor": ss.root_anchor}
                           for lang, ss in s.get("sourcesets", {}).items()},
            "capabilities": {lang: {"tier": c.tier, "handleKind": c.handle_kind}
                             for lang, c in s.get("capabilities", {}).items()},
            "nodes": [n.to_dict() for n in s.get("nodes", [])],
            "anchors": [vars(a) for a in s.get("anchors", [])],
            "decisions": {lang: [d.to_dict() for d in r.decisions]
                          for lang, r in s.get("dock_results", {}).items()},
            "edges": [e.to_dict() for e in s.get("edges", [])],
            "t3": s.get("t3"),
            "honestCeilings": [r.ceiling.to_dict()
                               for r in s.get("dock_results", {}).values()],
            "tallies": s.get("tally"),
            "logicalClock": self.bus._clock,
        }

    def tap(self, probe_id: str, fn: Callable[[ProbeEvent], None]) -> None:
        self.bus.tap(probe_id, fn)

    def history(self, strip_wall: bool = False) -> list[dict]:
        return self.bus.history(strip_wall=strip_wall)

    # ---- the run -----------------------------------------------------------
    def run(self, root: Path) -> dict:
        try:
            return self._run(root)
        except Exception as exc:
            self.bus.emit("extractor.error.caught", "pipeline", "error",
                          {"stage": "pipeline", "exception": f"{type(exc).__name__}: {exc}",
                           "sourceSpan": None})
            raise

    def _run(self, root: Path) -> dict:
        bus, cfg = self.bus, self.config

        # S0a — the import-boundary gate runs FIRST (Operating Contract 3).
        with StageTimer(bus, "S0.boundary"):
            check_boundary(bus)

        with StageTimer(bus, "S0.ingest"):
            sourcesets, capabilities, docks = ingest(
                bus, root, exclude_names=cfg.exclude_names,
                capability_fn=cfg.capability_fn or stub_capability,
                pinned_typst_main=cfg.pinned_typst_main)

        with StageTimer(bus, "S1.t1"):
            nodes, anchors = extract_t1(bus, sourcesets)

        dock_results: dict[str, DockResult] = {}
        pyright_backend = None
        with StageTimer(bus, "S2.docks"):
            for lang in sorted(docks):
                ss = sourcesets[lang]
                cap = capabilities[lang]
                dispatch = bus.emit("extractor.t2.dock.dispatch", "S2.docks", "decision",
                                    {"lang": lang, "dock": docks[lang]})
                dock = self._make_dock(lang, ss)
                if lang == "python":
                    pyright_backend = dock.pyright_backend
                lang_nodes = [n for n in nodes if n.lang == lang]
                bus.emit("extractor.t2.dock.contract.invoke", "S2.docks", "call",
                         {"dock": lang, "nodeCount": len(lang_nodes)}, cause=dispatch)
                result = dock.extract(ss, cap, nodes, anchors, bus, cause=dispatch)
                t = {"resolved": 0, "unresolved": 0, "rejected": 0}
                for d in result.decisions:
                    t[d.outcome] += 1
                bus.emit("extractor.t2.dock.contract.return", "S2.docks", "output", {
                    "dock": lang, "edgeCount": len(result.edges),
                    "resolvedCount": t["resolved"], "unresolvedCount": t["unresolved"],
                    "rejectedCount": t["rejected"]}, cause=dispatch)
                dock_results[lang] = result
        if pyright_backend is not None:
            if (self.config.pyright_mode == "record"
                    and self.config.pyright_recording_path is not None):
                self.config.pyright_recording_path.write_text(
                    json.dumps(pyright_backend.recording, indent=2, sort_keys=True),
                    encoding="utf8")
            pyright_backend.close()

        with StageTimer(bus, "S3.assemble"):
            edges, tally = assemble(bus, nodes, dock_results, capabilities)

        t3_result = None
        with StageTimer(bus, "S4.t3"):
            if cfg.roots:
                t3_result = compute_t3(
                    bus, nodes, edges, cfg.roots, cfg.johnson_length_bound,
                    set(sourcesets), out_dir=cfg.out_dir)
            else:
                bus.emit("extractor.t3.roots.selected", "S4.t3", "decision", {
                    "roots": [], "reason": "no roots configured — T3 skipped; no "
                    "unused claim is made (a claim without declared roots would be "
                    "unsound)", "unmatched": []})

        with StageTimer(bus, "S5.output"):
            bus.emit("extractor.gaps.honest", "S5.output", "state", {"gaps": HONEST_GAPS})
            ceilings = {lang: r.ceiling.to_dict() for lang, r in sorted(dock_results.items())}
            bus.emit("extractor.output.honest_ceiling.report", "S5.output", "state",
                     {"perDock": ceilings})
            resolved_n = sum(1 for e in edges if e.resolved)
            summary = {
                "nodes": len(nodes), "edges": len(edges), "resolved": resolved_n,
                "leads": len(edges) - resolved_n,
                "cycles": (t3_result or {}).get("cycles", []),
                "unused": (t3_result or {}).get("unusedSet", []),
                "twoLibAgree": (t3_result or {}).get("crossCheck", {}).get("agree"),
            }
            bus.emit("extractor.output.summary", "S5.output", "output", summary)

        self._state = {"sourcesets": sourcesets, "capabilities": capabilities,
                       "nodes": nodes, "anchors": anchors,
                       "dock_results": dock_results, "edges": edges,
                       "tally": tally, "t3": t3_result}
        # Canonical Graph envelope (assembly ruling 3): {schemaVersion:"v0",
        # nodes, edges, leads} — resolved:false lives ONLY in leads[], never
        # mixed into edges[].
        result = {
            "schemaVersion": "v0",
            "nodes": [n.to_dict() for n in nodes],
            "edges": [e.to_dict() for e in edges if e.resolved],
            "leads": [e.to_dict() for e in edges if not e.resolved],
            "t3": t3_result,
            "honestCeilings": ceilings,
            "summary": summary,
        }
        if cfg.out_dir is not None:
            cfg.out_dir.mkdir(parents=True, exist_ok=True)
            (cfg.out_dir / "graph.json").write_text(
                json.dumps({"schemaVersion": result["schemaVersion"],
                            "nodes": result["nodes"], "edges": result["edges"],
                            "leads": result["leads"]},
                           indent=2, sort_keys=True), encoding="utf8")
            (cfg.out_dir / "honest_ceilings.json").write_text(
                json.dumps(ceilings, indent=2, sort_keys=True), encoding="utf8")
            (cfg.out_dir / "history.jsonl").write_text(
                self.bus.history_jsonl(), encoding="utf8")
        return result

    def _make_dock(self, lang: str, ss: SourceSet):
        # ALL_DOCKS is resolved HERE (this module's global) so test seams that
        # patch extractor.pipeline.ALL_DOCKS keep working; construction logic
        # lives in pipeline_docks.make_dock (SUB200 restructure, verbatim).
        return make_dock(self.config, self.bus, lang, ss, ALL_DOCKS)
