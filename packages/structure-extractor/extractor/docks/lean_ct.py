"""S2 · Lean DOCK — the CT extraction path (orchestrator).

Drives the kernel driver one invocation per file (declared bound: single-file
driver), applies verdicts (lean_ct_fill), mints proof_uses/imports edges and
driver-dead leads (lean_ct_edges), and declares the honest ceiling with the
driver's limits[] VERBATIM plus the toolchain-pin divergence.

Split from lean_dock.py (SUB200 restructure); lean_dock.py stays the facade
and CT behavior still runs ONLY under a CT capability response (§5.8).
"""
from __future__ import annotations

from pathlib import Path

from ..capability import CapabilityHandle
from ..ingest import SourceSet
from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from .base import DockResult, HonestCeiling, edges_from_decisions
from .lean_common import CAP_LAYER_LEAN_PIN, STAGE, DriverDead
from .lean_ct_edges import dead_file_leads, mint_imports, mint_proof_uses
from .lean_ct_fill import apply_file_verdicts
from .lean_verdicts import match_decls


def extract_ct(dock, source: SourceSet, handle: CapabilityHandle,
               nodes: list[SchemaNode], anchors: list,
               bus: ProbeBus, cause: ProbeEvent | None) -> DockResult:
    decisions: list = []
    lean_nodes = [n for n in nodes if n.lang == "lean"]
    modules = {n.name: n for n in lean_nodes if n.kind == "module"}
    decls = [n for n in lean_nodes if n.kind in ("decl", "theorem")]
    files = {f.path: f for f in source.files}
    seen: set[tuple[str, str, str]] = set()

    dock._emit_lean_facts(bus, cause)

    # The pin divergence: DECLARED every CT run, never silently unified.
    try:
        driver_pin = (dock.driver_dir / "lean-toolchain").read_text(
            encoding="utf-8").strip()
    except OSError:
        driver_pin = "<unreadable>"
    divergence = {
        "driverPin": driver_pin,
        "capabilityPin": CAP_LAYER_LEAN_PIN,
        "action": ("declared-not-unified — driver keeps its two MEASURED "
                   "v4.31 quirks; cell 2 measured CT on v4.32.0; "
                   "unification is report-round work (re-measure whichever "
                   "pin moves, re-run run_smoke.py)")}
    bus.emit("extractor.t2.lean.toolchain.divergence", STAGE, "state",
             divergence, cause=cause)

    # ---- drive the kernel driver, one invocation per file (declared
    # bound: single-file driver; a multi-file tree = sequential runs) ----
    docs: dict[str, tuple[dict, str, int]] = {}
    dead_files: dict[str, str] = {}
    driver_limits: list[str] | None = None
    for f in sorted(source.files, key=lambda x: x.path):
        try:
            doc, sha, exit_code = dock._run_driver(bus, f.path, f.abspath, cause)
        except DriverDead as dd:
            dead_files[f.path] = dd.failure_class
            bus.emit("extractor.t2.lean.driver.dead", STAGE, "error", {
                "file": f.path, "failureClass": dd.failure_class,
                "detail": dd.detail}, cause=cause)
            bus.emit("extractor.error.caught", STAGE, "error", {
                "stage": STAGE, "exception": f"DriverDead: {dd}",
                "sourceSpan": {"file": f.path, "byteStart": 0, "byteEnd": 0}},
                cause=cause)
            continue
        docs[f.path] = (doc, sha, exit_code)
        if driver_limits is None:
            driver_limits = list(doc.get("limits", []))

    # ---- verdicts + unused hypotheses, per decl node --------------------
    unused_summary: dict[str, list[str]] = {}
    # [ASSEMBLY CHANGE REAL-INPUTS] driver-decl -> node assignment is the
    # DISAMBIGUATED per-file matching now (match_decls): the old
    # raw-last-component key collided on real inputs (Init/Classical.lean:
    # `choose` in-namespace vs top-level `Exists.choose`) and the last
    # writer silently won — crossed attestations, crossed proof_uses.
    # Every assignment AND every refusal is probed (decl.match).
    # NOTE (pre-existing, unchanged): ref->dst resolution below is keyed
    # by the resolved constant name across the whole ingest set — two
    # FILES each declaring the same full name stay a latent ambiguity of
    # the single-namespace ingest model, out of this round's scope.
    drv_name_to_node: dict[str, SchemaNode] = {}
    match_by_path: dict[str, tuple[dict[str, SchemaNode], dict[str, str]]] = {}
    for path, (doc, sha, exit_code) in sorted(docs.items()):
        owner = next((m for m in modules.values() if m.span.file == path),
                     None)
        stem = owner.name if owner is not None else Path(path).stem
        file_decl_nodes = [n for n in decls if n.span.file == path]
        by_drv, by_node, match_decisions = match_decls(
            file_decl_nodes, [d["name"] for d in doc.get("decls", [])],
            stem)
        match_by_path[path] = (by_drv, by_node)
        drv_name_to_node.update(by_drv)
        for dec in match_decisions:
            bus.emit("extractor.t2.lean.decl.match", STAGE, "decision",
                     dict(dec, file=path), cause=cause)

    for path, (doc, sha, exit_code) in sorted(docs.items()):
        apply_file_verdicts(bus, path, doc, sha, exit_code, files[path].data,
                            [n for n in decls if n.span.file == path],
                            modules, match_by_path[path][1], unused_summary,
                            cause)

    bus.emit("extractor.t2.lean.unusedHyp.summary", STAGE, "value", {
        "perDecl": dict(sorted(unused_summary.items())),
        "totalFlagged": sum(len(v) for v in unused_summary.values())},
        cause=cause)

    # ---- edge minting (lean_ct_edges): every drop probed, never silent -----
    import_anchors = [a for a in anchors
                      if a.lang == "lean" and a.anchor_kind == "import"]
    n_uses, n_rej_uses = mint_proof_uses(bus, docs, match_by_path,
                                         drv_name_to_node, decisions, seen,
                                         cause)
    n_imports, n_rej_imports = mint_imports(bus, docs, modules, import_anchors,
                                            decisions, seen, cause)
    n_rej = n_rej_uses + n_rej_imports
    dead_file_leads(bus, dead_files, modules, import_anchors, decls,
                    decisions, cause)

    bus.emit("extractor.t2.lean.candidate.count", STAGE, "value", {
        "proofUses": n_uses, "imports": n_imports, "inherits": 0,
        "rejected": n_rej}, cause=cause)

    edges = edges_from_decisions(decisions)
    ceiling = HonestCeiling(
        lang="lean",
        resolves=[
            "proof_uses (elaborated getUsedConstants over kernel-accepted decls)",
            "imports (elaborated header imports)",
            "kernel verdicts green/amber/red (kernel trustLevel 0 + collectAxioms)",
            "unusedHypotheses (explicit-binder telescope scan)"],
        cannotResolve=[
            "axioms nested in another axiom's type (#8840)",
            "per-ref / per-binder source positions (InfoTree deliberately unused)",
            "multi-file lake projects (single-file driver — declared, next round)",
            "inherits (structure parents) — not judged by this driver round"],
        resolverGrade="kernel (lean elaborator + kernel trustLevel 0, "
                      "single-file driver)",
        blindSpots=[
            "chases Lean's changing internal API — research-grade; "
            "toolchain-pinned by the driver's lean-toolchain file",
            "a decl that failed elaboration is ABSENT from decls[] — judged "
            "red only when an error anchors in its span; never green from absence"],
        extra={"tier": handle.tier,
               "driverLimits": driver_limits or [],   # VERBATIM driver limits[]
               "toolchainPinDivergence": divergence,
               "unusedHypothesesSummary": {
                   "perDecl": dict(sorted(unused_summary.items())),
                   "totalFlagged": sum(len(v) for v in unused_summary.values())},
               "driverDeadFiles": dict(sorted(dead_files.items())),
               "status": "lean kernel driver wired (CT); one invocation "
                         "per file (~3s warm, probed per-invocation)"})
    bus.emit("extractor.t2.lean.honest_ceiling", STAGE, "state",
             ceiling.to_dict(), cause=cause)
    return DockResult(edges=edges, decisions=decisions, ceiling=ceiling)
