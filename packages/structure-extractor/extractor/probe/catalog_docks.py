"""Probe catalog section: T2 dock dispatch + Python dock + Lean dock incl. the
CT driver path (spec §6.3–§6.5b).

One section of the exhaustive §6 enumeration — aggregated, IN ORDER, by
catalog.py (the probeCatalog() source of truth).  Entry shape:
(probeId, kind, payloadType, description).
"""

from __future__ import annotations

CATALOG_DOCKS: list[tuple[str, str, str, str]] = [
    # ---- §6.3 S2 T2 DOCK DISPATCH ------------------------------------------
    ("extractor.t2.dock.dispatch", "decision", "{lang, dock}",
     "Route source into the per-language dock."),
    ("extractor.t2.dock.contract.invoke", "call", "{dock, nodeCount}",
     "The dock's extract(source, handle, nodes) contract fired."),
    ("extractor.t2.dock.contract.return", "output", "{dock, edgeCount, resolvedCount, unresolvedCount, rejectedCount}",
     "The dock's tally — the fastest read of a dock's honest ceiling."),

    # ---- §6.4 S2·Python DOCK (SHIP) ----------------------------------------
    ("extractor.t2.py.grimp.build", "call", "{package, options}",
     "grimp.build_graph(package)."),
    ("extractor.t2.py.grimp.module", "node", "{module, inT1NodeSet}",
     "Each module grimp registers (cross-checks the S1 module node set)."),
    ("extractor.t2.py.grimp.import.candidate", "edge", "{srcModule, dstModule}",
     "Every import candidate (module->module)."),
    ("extractor.t2.py.grimp.import.resolved", "decision", "{srcId, dstId, resolved, resolver}",
     "grimp operates on the REAL import graph: import edges resolved by construction — recorded explicitly."),
    ("extractor.t2.py.grimp.reachability", "value", "{query, result}",
     "grimp's own find_upstream/find_downstream answers (kept as a T3 cross-check, not the primary)."),
    ("extractor.t2.py.pyright.invoke", "call", "{file, request}",
     "Pyright name-resolution request (subprocess LSP or recorded replay)."),
    ("extractor.t2.py.pyright.def", "node", "{name, span}",
     "A definition occurrence Pyright resolved."),
    ("extractor.t2.py.pyright.ref", "edge", "{useSiteSpan, boundDefSpan}",
     "A reference occurrence Pyright bound to a def."),
    ("extractor.t2.py.call.candidate", "edge", "{srcId, calleeName, useSiteSpan}",
     "A call use-site (a name at a call position), still unresolved."),
    ("extractor.t2.py.call.resolve.decision", "decision", "{candidate, outcome, boundDstId|null, reason}",
     "THE load-bearing lead: outcome∈resolved/unresolved/rejected + WHY. Reading this stream is reading the dock's ceiling."),
    ("extractor.t2.py.call.rejected", "edge", "{candidate, reason}",
     "Rejected candidates: builtin, self-recursion, duplicate, out-of-project."),
    ("extractor.t2.py.inherits.candidate", "edge", "{classId, baseName}",
     "class->base candidate."),
    ("extractor.t2.py.edge.provenance", "value", "{edgeId, tier, extractor, resolver, resolved}",
     "Provenance stamp on each Python edge."),
    ("extractor.t2.py.scip.fallback", "branch", "{considered, chosen, reason}",
     "Decision D2: scip-python considered and NOT used (lags Pyright; 2026 activity unconfirmed)."),
    ("extractor.t2.py.honest_ceiling", "state", "HonestCeiling",
     "The Python dock's full declaration: resolves / cannotResolve / resolverGrade / blindSpots."),

    # ---- §6.5 S2·Lean DOCK (G path + dormant design entries; the CT
    # kernel-driver leads are §6.5b) ------------------------------------------
    ("extractor.t2.lean.infotree.acquire", "call", "{module, request}",
     "DORMANT (design-stub): bespoke extractor over InfoTree/CommandElabM — carries resolved constants per span."),
    ("extractor.t2.lean.const.candidate", "edge", "{srcDeclId, usedConstant}",
     "Expr.getUsedConstants -> a proof_uses candidate. G path: seeded from syntactic co-occurrence; CT path: the driver's decls[].refs."),
    ("extractor.t2.lean.const.resolve.decision", "decision", "{candidate, outcome, boundDstId|null, reason}",
     "Every lean candidate's decision. G path: always a lead; CT path (LEAN-DOCK round): resolved via the kernel driver, or a probed rejection/lead."),
    ("extractor.t2.lean.axioms.print", "call", "{decl, request}",
     "DORMANT (design-stub): #print axioms / collectAxioms — transitive axiom reachability."),
    ("extractor.t2.lean.axiom.reach", "value", "{decl, axioms, hasSorryAx, hasNativeDecide}",
     "DORMANT (design-stub): axiom-reachability set; sorryAx flags incompleteness."),
    ("extractor.t2.lean.axiom.gap", "decision", "{decl, reason}",
     "Lean issue #8840: axiom referenced only inside another axiom's type is NOT followed — logged, never hidden."),
    ("extractor.t2.lean.import.graph", "call", "{request}",
     "DORMANT (design-stub): lake exe graph -> module import DAG."),
    ("extractor.t2.lean.import.edge", "edge", "{srcModule, dstModule, resolved}",
     "Module->module import. G path: T1-anchor candidates, emitted as leads; CT path: resolved when the elaborated header target is ingested."),
    ("extractor.t2.lean.import.cycle.na", "branch", "{reason}",
     "Decision D7 branch NOT taken: Lean/Lake forbid import cycles at build time — DAG by construction."),
    ("extractor.t2.lean.inherits", "edge", "{structId, parentId}",
     "DORMANT (design-stub): structure parents -> inherits."),
    ("extractor.t2.lean.edge.rejected", "edge", "{candidate, reason}",
     "Rejected: core constant not ingested, self-reference, duplicate proof_uses."),
    ("extractor.t2.lean.candidate.count", "value", "{proofUses, imports, inherits, rejected}",
     "Per-run candidate tally."),
    ("extractor.t2.lean.honest_ceiling", "state", "HonestCeiling",
     "Lean dock declaration: kernel grade when live; blind spots #8840, changing internal API, no std serialization."),

    # ---- §6.5b S2·Lean DOCK — CT driver path (LEAN-DOCK round; additive) ----
    ("extractor.t2.lean.driver.invoke", "call", "{file, cmd, cwd, timeoutS}",
     "The kernel driver subprocess is being invoked for one .lean file (cwd pins the toolchain via the adjacent lean-toolchain file)."),
    ("extractor.t2.lean.driver.timing", "timing", "{file, wallNanos}",
     "Per-invocation driver latency (~2.5-3s warm, up to ~76s on a cold toolchain) — the declared per-file cost, measured every run."),
    ("extractor.backend.leanDriver.req", "call", "{file, cmd}",
     "Lean kernel driver request (subprocess `lean --run Driver.lean <file>`; single-file, toolchain-pinned v4.31.0)."),
    ("extractor.backend.leanDriver.resp", "call", "{file, exit, runSha, doc}",
     "The driver's ONE-line JSON document verbatim (decls/imports/errors/limits/toolchain) + its sha256 — the evidence every verdict cites."),
    ("extractor.t2.lean.decl.match", "decision", "{file, decl, nodeId|null, outcome, method|candidates|contendedNodeId|reason}",
     "REAL-INPUTS round: per-file driver-decl -> T1-node assignment (exact / dotted-suffix on the WRITTEN identifier; raw-name collisions disambiguated — measured on Init/Classical.lean; any residual ambiguity attests NOTHING, never a silent last-writer win)."),
    ("extractor.t2.lean.verdict", "decision", "{nodeId, decl, verdict, origin, kernelAccepted, usesSorry, unexpectedAxioms, errorInSpan, source, reason}",
     "Per-decl kernel verdict mapping: green = kernelAccepted ∧ ¬usesSorry ∧ unexpectedAxioms=[] ∧ error-free file; sorry → amber; elaboration error → red; unjudged → unknown (NEVER green from absence)."),
    ("extractor.t2.lean.unusedHyp", "value", "{nodeId, decl, binders}",
     "unusedHypotheses for one decl (explicit binders unused by the elaborated proof term) — the per-decl probed payload."),
    ("extractor.t2.lean.unusedHyp.summary", "value", "{perDecl, totalFlagged}",
     "Run-level unused-hypothesis summary; also rides the envelope inside the lean honestCeiling (extra.unusedHypothesesSummary)."),
    ("extractor.t2.lean.driver.dead", "error", "{file, failureClass, detail}",
     "Typed driver-dead failure (driver-timeout | driver-crash | driver-bad-json): the file's decls stay unknown, its anchors become leads — no partial green, ever."),
    ("extractor.t2.lean.toolchain.divergence", "state", "{driverPin, capabilityPin, action}",
     "Declared toolchain-pin divergence: driver v4.31.0 (measured quirks) vs cell-2 lean_repo v4.32.0 (measured CT) — declared, not silently unified."),
]
