"""S2 · Lean DOCK — CT driver path WIRED (LEAN-DOCK remediation round);
G-tier placeholder behavior preserved byte-for-byte below it.

Deepest possible access in the whole stack when live (the tools ELABORATE and
KERNEL-CHECK), but entirely bespoke — no uniform indexer (SCIP/Joern/CodeQL/
Kythe) reaches Lean.  All backends Apache-2.0.

CT PATH (this round — the proven spike driver, vessels/REPORT-LEAN-DRIVER-SPIKE.md):
  For each ingested .lean file the dock shells out to the kernel-grade driver
  (`lean --run Driver.lean <file>`, cwd = extractor/docks/lean_driver/ so the
  adjacent lean-toolchain file pins leanprover/lean4:v4.31.0) and consumes its
  ONE-line JSON document:
    * decls[].refs (getUsedConstants over the ELABORATED type+value) →
      RESOLVED proof_uses edges, filtered to constants that are themselves
      decls in the ingested node set; out-of-project/core constants are
      probed rejections (X_CORE), never silent drops;
    * imports[] (elaborated header) → module-level import edges where the
      target module is in the node set; the implicit Init prelude is a probed
      X_CORE rejection;
    * kernel verdicts → fill: green = kernelAccepted ∧ ¬usesSorry ∧
      unexpectedAxioms=[] in an error-free file (origin "checked", source
      "lean-kernel:v<ver>:… run=<sha16 of the driver stdout>"); usesSorry →
      amber; an error-severity diagnostic anchored in a decl's span → red;
      anything unjudged stays unknown — NEVER green from absence;
    * unusedHypotheses[] → per-decl probed payloads + a run summary riding
      the honestCeiling (extra.unusedHypothesesSummary) — the Node schema is
      CLOSED, so the payload rides the probe stream + ceiling, not new fields;
    * limits[] → rides the honestCeiling VERBATIM (extra.driverLimits),
      single-file bound included (multi-file lake = declared, next round).
  Driver-dead (timeout/crash/bad-json) is a TYPED failure: tree-killed on
  timeout (taskkill /T — the elan shim spawns a child lean), probed as
  extractor.t2.lean.driver.dead, the file's decls stay unknown and its
  anchors become U_BACKEND_* leads — no partial green, ever.

  Toolchain-pin divergence (DECLARED, not unified): this driver pins v4.31.0
  (two measured quirks); cell 2's lean_repo measures CT on v4.32.0.  The
  divergence is probed (extractor.t2.lean.toolchain.divergence) and rides the
  ceiling; unification is report-round work (re-measure whichever pin moves).

G-TIER PATH (unchanged this round): the stub consumes T1 anchors (imports) and
syntactic name co-occurrence as CANDIDATE SEEDS, and — because tier G grants
no resolution rights — every candidate is emitted as a LEAD.  A dock may never
upgrade its own tier (§5.8): CT behavior runs ONLY under a CT capability
response (the REAL negotiated tier arrives through the V1 feed at analyze()).

SUB200 restructure: this module is now the FACADE (dock registry name stable).
Constants + typed driver-dead failure live in lean_common.py; driver
invocation/parsing in lean_ct_driver.py; verdict mapping + decl matching in
lean_verdicts.py; verdict application in lean_ct_fill.py; edge minting in
lean_ct_edges.py; the CT orchestrator in lean_ct.py; the G path in lean_g.py.
The public surface here is unchanged — importers need zero edits.
"""
from __future__ import annotations

from pathlib import Path

from ..capability import CapabilityHandle, TIER_CT
from ..ingest import SourceSet
from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from ..t1 import Anchor
from .base import Dock, DockResult
from .lean_common import (CAP_LAYER_LEAN_PIN, DRIVER_DIR,  # noqa: F401
                          DRIVER_TIMEOUT_S, STAGE, DriverDead,
                          _default_lean_exe, _pos_to_byte, run_ref)
from .lean_ct import extract_ct
from .lean_ct_driver import run_driver
from .lean_g import extract_g
from .lean_verdicts import lean_verdict, match_decls  # noqa: F401


class LeanDock(Dock):
    lang = "lean"

    def __init__(self, timeout_s: float | None = None,
                 lean_exe: str | None = None,
                 driver_dir: Path | None = None):
        self.timeout_s = DRIVER_TIMEOUT_S if timeout_s is None else timeout_s
        self.lean_exe = lean_exe            # None -> default resolution
        self.driver_dir = Path(driver_dir) if driver_dir else DRIVER_DIR

    # ------------------------------------------------------------------ entry
    def extract(self, source: SourceSet, handle: CapabilityHandle,
                nodes: list[SchemaNode], anchors: list[Anchor],
                bus: ProbeBus, cause: ProbeEvent | None = None) -> DockResult:
        # Tier semantics stay MEASURED: CT behavior only under a CT capability
        # response; at G/S/P the dock behaves exactly as the placeholder did.
        if handle.tier == TIER_CT:
            return self._extract_ct(source, handle, nodes, anchors, bus, cause)
        return self._extract_g(source, handle, nodes, anchors, bus, cause)

    # ---------------------------------------------------------------- helpers
    def _emit_lean_facts(self, bus: ProbeBus, cause: ProbeEvent | None) -> None:
        """Facts of Lean, probed on EVERY path (D7 + the #8840 blind spot)."""
        bus.emit("extractor.t2.lean.import.cycle.na", STAGE, "branch", {
            "reason": ("Lean/Lake forbid import cycles at build time — DAG by "
                       "construction; no cycle detector run")}, cause=cause)
        bus.emit("extractor.t2.lean.axiom.gap", STAGE, "decision", {
            "decl": "*", "reason": ("Lean issue #8840: axiom referenced only inside "
                                    "another axiom's type is NOT followed")}, cause=cause)

    def _run_driver(self, bus: ProbeBus, rel_path: str, abspath: Path,
                    cause: ProbeEvent | None) -> tuple[dict, str, int]:
        """Invoke the kernel driver on ONE file (lean_ct_driver.run_driver)."""
        return run_driver(bus, rel_path, abspath, cause,
                          lean_exe=self.lean_exe, driver_dir=self.driver_dir,
                          timeout_s=self.timeout_s)

    # --------------------------------------------------------------- CT path
    def _extract_ct(self, source: SourceSet, handle: CapabilityHandle,
                    nodes: list[SchemaNode], anchors: list[Anchor],
                    bus: ProbeBus, cause: ProbeEvent | None) -> DockResult:
        return extract_ct(self, source, handle, nodes, anchors, bus, cause)

    # ---------------------------------------------------------------- G path
    # (the pre-round placeholder, byte-stable in behavior: T1 nodes + leads,
    # zero resolved edges — asserted by the tier-G regression golden)
    def _extract_g(self, source: SourceSet, handle: CapabilityHandle,
                   nodes: list[SchemaNode], anchors: list[Anchor],
                   bus: ProbeBus, cause: ProbeEvent | None = None) -> DockResult:
        return extract_g(self, source, handle, nodes, anchors, bus, cause)
