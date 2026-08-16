"""Stage J — the Capability Probe (P0–P11): the verdict (playbook §4).

Runs the battery over the WIRED handle and MEASURES the tier; the measured tier
overrides the paper guess. P2 (inject a type error) is the compiler-truth litmus:
no diagnostic ⇒ at best STRUCTURE, and `fill.status=green` is forbidden forever.

Probe targets are derived by scanning the repo text (no hardcoded line numbers),
so the same battery runs against the CT shim, the structure-only stand-in, and
the floor-only target.

Carried caveats (verbatim from the build prompt):
  * P9: callHierarchy/typeHierarchy are OPTIONAL LSP capabilities (texlab,
    tinymist, Lean support them partially or not at all). If the provider is
    absent, P9 is `skip`, NOT `fail`; never downgrade a tier for it.
  * P2: Gleam passes P2 (it IS the compiler); Zig's zls fails P2 by default
    (its own analyzer, not Sema). The README would not tell you; the probe does.
"""

from __future__ import annotations

from .probe_battery import (  # noqa: F401  (re-exported public surface)
    STAGE, _BatteryBase, _find_pos, lsp_char, stamp_tier)
from .probe_p0_p2 import _ProbesP0toP2
from .probe_p3_p5 import _ProbesP3toP5
from .probe_p6_p11 import _ProbesP6toP11
from .schema import green_allowed


class _Battery(_ProbesP0toP2, _ProbesP3toP5, _ProbesP6toP11, _BatteryBase):
    """The assembled battery -- the SUB200 split composes the probe-family
    mixins over the base; methods and behavior are identical to the
    original single-file _Battery."""


def run(bus, *, client, floor_handle, repo_root, profile, config, paper_tier,
        floor_nanos) -> dict:
    if client is not None:
        client.stage = "probe"
    b = _Battery(bus, client, floor_handle, repo_root, profile, config,
                 paper_tier, floor_nanos)
    b._guarded("p0", b.p0_capabilities, "capability map")
    b._guarded("p1", b.p1_open_clean, "aliveness")
    b._guarded("p2", b.p2_inject_type_error, "compiler truth")
    b._guarded("p3", b.p3_hover_inferred, "inference")
    b._guarded("p4", b.p4_cross_file_definition, "workspace semantics")
    b._guarded("p5", b.p5_references, "workspace index")
    b._guarded("p6", b.p6_completion_after_import, "library surfacing")
    b._guarded("p7", b.p7_cross_file_rename, "semantic rename")
    b._guarded("p8", b.p8_generated_symbols, "generated symbols")
    b._guarded("p9", b.p9_call_hierarchy, "optional hierarchy")
    cold = b.p10_cold_start()
    b._guarded("p11", b.p11_restart, "restart caching")

    measured = stamp_tier(b.measured_tier(), b.p2)
    bus.emit("capability.probe.measuredTier", "decision",
             {"measuredTier": measured, "overrode": paper_tier}, stage=STAGE)
    bus.emit("capability.probe.faked", "decision",
             {"tier": measured, "p2": b.p2,
              "greenAllowed": green_allowed(measured, b.p2)}, stage=STAGE)

    return {"results": b.results, "measuredTier": measured, "p2": b.p2,
            "coldStartNanos": cold, "restartFast": b.restart_fast,
            "paperTier": paper_tier}
