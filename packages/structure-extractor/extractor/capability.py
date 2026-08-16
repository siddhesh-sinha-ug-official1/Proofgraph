"""Tree 2's capability handle — LOCAL STUB (parallel-build rule: interface
shape only; stub it, build against it, expose the seam).

Real contract (owned by Tree 2):  capability(lang) -> { tier, handle }
  tier ∈ CT (compiler-truth) / S (structure) / G (grammar) / P (plaintext)
  handle = the live LSP/CLI connection Tree 2 already negotiated.

This cell does NOT detect capability — it obeys the reported tier.  The stub
below reports what is honestly reachable in THIS environment:
  * python -> CT: pyright is reachable as a subprocess (real name resolution),
    grimp operates on the real import graph.
  * lean -> CT (remediation round, LEAN-DOCK): the kernel-grade lean driver
    (extractor/docks/lean_driver/, toolchain pinned leanprover/lean4:v4.31.0)
    is honestly reachable as a subprocess on this machine — verdicts come
    from real elaboration at kernel trustLevel 0.  The REAL negotiated tier
    still arrives from cell 2 (capability-layer) through the V1 feed at
    analyze() time; this stub mirrors python's "reachable here" honesty only.
  * latex/typst/go/c/cpp -> G: only the tree-sitter grammar floor is
    negotiated here (no LaTeXML/tinymist server was stood up), so their
    docks may emit T1 nodes and LEADS only — resolved=true is forbidden at G
    (spec §5.8; 'green may never be faked' at the tier seam).

Which tiers may emit resolved edges is the SEAM OWNER's table, mirrored from
packages/schema/gen/capability_constants.py and verified-in-sync by
selftest/test_schema_sync.py.  Assembly ruling 2: S-tier may NOT emit resolved
edges — resolution is CT-only.

Swapping in Tree 2's real function is a one-line change: pass it as
PipelineConfig.capability_fn.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

TIER_CT = "CT"
TIER_S = "S"
TIER_G = "G"
TIER_P = "P"

DEPTH_TIERS = (TIER_CT, TIER_S, TIER_G, TIER_P)

# Mirror of gen/capability_constants.py (assembly ruling 2: CT only).
DEPTH_ALLOWS_RESOLVED_EDGES: dict[str, bool] = {
    TIER_CT: True, TIER_S: False, TIER_G: False, TIER_P: False,
}


@dataclass
class CapabilityHandle:
    lang: str
    tier: str            # CT | S | G | P
    handle_kind: str     # human-readable description of what the handle drives
    handle: Any = None   # opaque backend driver (e.g. a PyrightBackend)

    def allows_resolution(self) -> bool:
        # Assembly ruling 2: S-tier may NOT emit resolved edges (CT only).
        return DEPTH_ALLOWS_RESOLVED_EDGES.get(self.tier, False)


def stub_capability(lang: str) -> CapabilityHandle:
    """The local stand-in for Tree 2's capability(lang)."""
    if lang == "python":
        return CapabilityHandle(lang, TIER_CT, "pyright-subprocess+grimp")
    if lang == "lean":
        # LEAN-DOCK round: mirrors python — the driver + pinned toolchain are
        # reachable in THIS environment; cell 2's measured tier still rules
        # whenever the V1 feed is plugged (capability_fn injection).
        return CapabilityHandle(lang, TIER_CT, "lean-kernel-driver-subprocess")
    return CapabilityHandle(lang, TIER_G, "tree-sitter-floor")
