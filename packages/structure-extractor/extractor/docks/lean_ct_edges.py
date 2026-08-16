"""S2 · Lean DOCK — CT edge minting: proof_uses from decls[].refs, imports
from the elaborated header, and driver-dead leads.

RESOLVED proof_uses edges are filtered to constants that are themselves decls
in the ingested node set; out-of-project/core constants are probed rejections
(X_CORE), never silent drops.  The implicit Init prelude is a probed X_CORE
rejection.  Driver-dead files: anchors become U_BACKEND_* leads, decls stay
unknown — no partial green, ever.

Split from lean_dock.py (SUB200 restructure); lean_dock.py stays the facade.
"""
from __future__ import annotations

from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from . import reasons as R
from .base import CandidateEdge, decide_rejected, decide_resolved, decide_unresolved
from .lean_common import STAGE, run_ref


def mint_proof_uses(bus: ProbeBus, docs: dict, match_by_path: dict,
                    drv_name_to_node: dict[str, SchemaNode], decisions: list,
                    seen: set, cause: ProbeEvent | None) -> tuple[int, int]:
    """proof_uses: RESOLVED from decls[].refs, filtered to the ingested decl
    node set; every drop probed, never silent.  Returns (n_uses, n_rej)."""
    n_uses = n_rej = 0
    for path, (doc, sha, exit_code) in sorted(docs.items()):
        # [ASSEMBLY CHANGE REAL-INPUTS] src = the decl's OWN node via the
        # disambiguated per-file assignment (was: raw last-component)
        by_drv = match_by_path[path][0]
        for d in doc.get("decls", []):
            src = by_drv.get(d["name"])
            span = ({"file": src.span.file, "byteStart": src.span.byteStart,
                     "byteEnd": src.span.byteEnd} if src is not None
                    else {"file": path, "byteStart": 0, "byteEnd": 0})
            if src is None:
                # a driver decl with no owning T1 node (auxiliary etc.):
                # probed rejection, never a silent drop (C2 precedent)
                cand = CandidateEdge("proof_uses", "<no-owner>", d["name"],
                                     None, span, "lean-driver")
                dd = decide_rejected(cand, R.X_NO_OWNER,
                                     note=f"driver decl {d['name']} has no "
                                          f"unambiguous T1 node (see "
                                          f"extractor.t2.lean.decl.match)")
                decisions.append(dd)
                n_rej += 1
                bus.emit("extractor.t2.lean.const.resolve.decision", STAGE,
                         "decision", dd.to_dict(), cause=cause)
                continue
            for ref in d.get("refs", []):
                ev = bus.emit("extractor.t2.lean.const.candidate", STAGE,
                              "edge", {"srcDeclId": src.id,
                                       "usedConstant": ref}, cause=cause)
                cand = CandidateEdge(
                    "proof_uses", src.id, ref,
                    {"driverEvidence": f"run={run_ref(sha)}",
                     "note": "per-ref source positions are a declared "
                             "driver limit (InfoTree-free); span = decl span"},
                    span, "lean-driver")
                dst = drv_name_to_node.get(ref)
                if dst is None:
                    dd = decide_rejected(
                        cand, R.X_CORE,
                        note=f"constant {ref} not in the ingested decl set")
                    n_rej += 1
                elif dst.id == src.id:
                    dd = decide_rejected(cand, R.X_SELF, note="self-reference")
                    n_rej += 1
                else:
                    key = ("proof_uses", src.id, dst.id)
                    if key in seen:
                        dd = decide_rejected(cand, R.X_DUP)
                        n_rej += 1
                    else:
                        seen.add(key)
                        dd = decide_resolved(cand, dst.id, R.R_LEAN_DRIVER,
                                             "lean-kernel")
                        n_uses += 1
                decisions.append(dd)
                bus.emit("extractor.t2.lean.const.resolve.decision", STAGE,
                         "decision", dd.to_dict(), cause=ev)
                if dd.outcome == "rejected":
                    bus.emit("extractor.t2.lean.edge.rejected", STAGE, "edge",
                             {"candidate": cand.to_dict(), "reason": dd.reason},
                             cause=ev)
    return n_uses, n_rej


def mint_imports(bus: ProbeBus, docs: dict, modules: dict[str, SchemaNode],
                 import_anchors: list, decisions: list, seen: set,
                 cause: ProbeEvent | None) -> tuple[int, int]:
    """imports: elaborated header imports[].  Returns (n_imports, n_rej)."""
    n_imports = n_rej = 0
    for path, (doc, sha, exit_code) in sorted(docs.items()):
        owner = next((m for m in modules.values() if m.span.file == path), None)
        drv_imports = list(doc.get("imports", []))
        covered: set[str] = set()

        def _decide_import(target: str, span: dict, elaborated: bool):
            nonlocal n_imports, n_rej
            if owner is None:
                cand = CandidateEdge("imports", "<no-owner>", target, None,
                                     span, "lean-driver")
                dd = decide_rejected(cand, R.X_NO_OWNER, note=path)
                decisions.append(dd)
                n_rej += 1
                bus.emit("extractor.t2.lean.const.resolve.decision", STAGE,
                         "decision", dd.to_dict(), cause=cause)
                return
            dst_mod = modules.get(target)
            ev = bus.emit("extractor.t2.lean.import.edge", STAGE, "edge", {
                "srcModule": owner.name, "dstModule": target,
                "resolved": bool(elaborated and dst_mod is not None)},
                cause=cause)
            cand = CandidateEdge("imports", owner.id, target,
                                 {"driverEvidence": f"run={run_ref(sha)}"},
                                 span, "lean-driver")
            if not elaborated:
                dd = decide_unresolved(
                    cand, R.U_IMPORT_UNRESOLVED,
                    note="not among the elaborated header imports "
                         "(failed header or unavailable module)")
            elif dst_mod is not None:
                key = ("imports", owner.id, dst_mod.id)
                if key in seen:
                    dd = decide_rejected(cand, R.X_DUP)
                    n_rej += 1
                else:
                    seen.add(key)
                    dd = decide_resolved(cand, dst_mod.id, R.R_LEAN_IMPORT,
                                         "lean-kernel")
                    n_imports += 1
            elif target == "Init" or target.startswith("Init."):
                dd = decide_rejected(cand, R.X_CORE,
                                     note="implicit Init prelude — core "
                                          "not ingested")
                n_rej += 1
            else:
                dd = decide_rejected(cand, R.X_OUTPROJ,
                                     note=f"external module {target}")
                n_rej += 1
            decisions.append(dd)
            bus.emit("extractor.t2.lean.const.resolve.decision", STAGE,
                     "decision", dd.to_dict(), cause=ev)
            if dd.outcome == "rejected":
                bus.emit("extractor.t2.lean.edge.rejected", STAGE, "edge",
                         {"candidate": cand.to_dict(), "reason": dd.reason},
                         cause=ev)

        for a in [x for x in import_anchors if x.file == path]:
            covered.add(a.target_text)
            _decide_import(a.target_text,
                           {"file": a.file, "byteStart": a.byte_start,
                            "byteEnd": a.byte_end},
                           elaborated=a.target_text in drv_imports)
        for m in drv_imports:
            if m not in covered:      # e.g. the implicit Init prelude
                _decide_import(m, {"file": path, "byteStart": 0, "byteEnd": 0},
                               elaborated=True)
    return n_imports, n_rej


def dead_file_leads(bus: ProbeBus, dead_files: dict[str, str],
                    modules: dict[str, SchemaNode], import_anchors: list,
                    decls: list[SchemaNode], decisions: list,
                    cause: ProbeEvent | None) -> None:
    """Driver-dead files: anchors become leads, decls stay unknown."""
    for path, cls in sorted(dead_files.items()):
        reason = (R.U_BACKEND_TIMEOUT if cls == "driver-timeout"
                  else R.U_BACKEND_ERROR)
        owner = next((m for m in modules.values() if m.span.file == path), None)
        for a in [x for x in import_anchors if x.file == path]:
            span = {"file": a.file, "byteStart": a.byte_start,
                    "byteEnd": a.byte_end}
            if owner is None:
                cand = CandidateEdge("imports", "<no-owner>", a.target_text,
                                     None, span, "lean-driver")
                dd = decide_rejected(cand, R.X_NO_OWNER, note=path)
            else:
                cand = CandidateEdge("imports", owner.id, a.target_text,
                                     None, span, "lean-driver")
                dd = decide_unresolved(cand, reason,
                                       note=f"lean driver dead ({cls})")
            decisions.append(dd)
            bus.emit("extractor.t2.lean.const.resolve.decision", STAGE,
                     "decision", dd.to_dict(), cause=cause)
        for n in [x for x in decls if x.span.file == path]:
            bus.emit("extractor.t2.lean.verdict", STAGE, "decision", {
                "nodeId": n.id, "decl": n.name, "verdict": "unknown",
                "origin": n.origin, "kernelAccepted": None,
                "usesSorry": None, "unexpectedAxioms": None,
                "errorInSpan": False, "source": None,
                "reason": f"driver dead ({cls}) — unjudged, never green"},
                cause=cause)
