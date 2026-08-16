"""Gate 17 — the REAL lean profile (remediation-round CAP-LEAN cell change
request; mirrors Gate 16's V1 python precedent).

The 'lean' profile wires the real Lean 4 language server (the toolchain's own
watchdog — the elaborator IS the server), spawned exactly as the assembly
records for this machine: `lake +leanprover/lean4:v4.32.0 --dir=<testbed/
lean_repo> serve` (toolchain PINNED in the argv: elan's default 'stable'
drifts — observed live v4.32.0 → v4.32.2 within days).  A catalogued prepare
lead (`lake build`) compiles the fixture libs first — measured fact: lake
serve does NOT auto-build imports on this toolchain, and an unbuilt workspace
leaves main.lean's header failing ("unknown module prefix 'Util'").

Nothing in the profile asserts a tier — the assertions below pin what the
battery MEASURED on this machine (observed live, 2026-07-29: **CT**, earned
by a genuine P2 pass — the appended `example : Nat := "s"` came back as a
severity-1 'Type mismatch … String … Nat' anchored at the injected line),
together with the P2 evidence, so the tier can never drift from its proof.

Measured consequences of the ybg-flavored probes, DOCUMENTED not hidden:
  * P6 (completion after `import lib` / `lib.`): the scratch document puts
    `lib.` at COMMAND position, which is not a term context in lean — the
    server answers with zero items ("unexpected identifier; expected
    command").  P6 therefore measures **fail**; it does not gate the depth
    tier (only P2 does).
  * library inventory (stage H): the on-demand source records the same empty
    answer — for lean the inventory is EMPTY, not merely detail-reduced as
    for python.  The non-uniformity lead lists the sources used.
  * P3 skips (lean has no `let x = …` unannotated-let surface for the scan;
    lean writes `let x := …`).
  * P4/P5/P7 measure PASS via the profile's own call-site scan patterns —
    lean application is whitespace-sensitive (`f(x)` is a parse error), so
    the profile overrides the ybg-shaped `name(` patterns with `name (`.
  * P8 measures PASS via semanticTokens (lean advertises the provider —
    unlike pyright's fixture path), P9 PASS via call hierarchy.

The shared live run + the LOUD lake skip live in lean_common.py (SUB200
split); the shutdown/orphan-sweep gate runs last, in
test_17b_lean_shutdown.py.
"""

import sys
import unittest

import capability.capability               # noqa: F401  (ensure submodule)
from capability.schema import green_allowed
from capability.tests.lean_common import _STATE, get_lean_wall
from capability.tests.wall_common import _events

cap_mod = sys.modules["capability.capability"]


class TestLeanProfileLive(unittest.TestCase):
    def test_a_real_lean_server_wired(self):
        get_lean_wall()
        # the catalogued prepare step ran and succeeded (lake build)
        prep = _events(_STATE["hist"], "capability.wire.prepare")
        self.assertEqual(len(prep), 1, "prepare lead missing — setup was silent")
        self.assertEqual(prep[0]["payload"]["exitCode"], 0,
                         f"lake build failed: {prep[0]['payload']}")
        self.assertEqual(prep[0]["payload"]["argv"][-1], "build")
        # a real lake serve spawn on the wire
        spawns = _events(_STATE["hist"], "capability.wire.spawn")
        self.assertTrue(spawns, "no server spawn lead — lean never wired")
        argv = spawns[0]["payload"]["argv"]
        self.assertEqual(argv[-1], "serve")
        self.assertTrue(any(a.startswith("--dir=") for a in argv),
                        "workspace --dir missing — serve would be cwd-dependent")
        # P0 read back a real capability map
        p0 = _events(_STATE["hist"], "capability.probe.p0")[-1]["payload"]
        self.assertEqual(p0["verdict"], "pass")
        self.assertIn("completionProvider", p0["response"])

    def test_b_measured_tier_is_the_pin_truth(self):
        wall = get_lean_wall()
        measured = _events(_STATE["hist"], "capability.probe.measuredTier")
        self.assertEqual(len(measured), 1)
        pin_tier = measured[0]["payload"]["measuredTier"]
        # face == pin, byte-equal
        self.assertEqual(wall.tier, pin_tier)
        self.assertEqual(wall.tier.encode("utf-8"), pin_tier.encode("utf-8"))
        # the MEASURED result on this machine, pinned WITH its proof: CT was
        # earned by a genuine P2 pass (see test_c) — never asserted a priori.
        self.assertEqual(pin_tier, "CT",
                         "lean's measured tier changed — re-read the P2 "
                         "evidence before touching this pin")
        faked = _events(_STATE["hist"], "capability.probe.faked")[-1]["payload"]
        self.assertEqual(faked["greenAllowed"],
                         green_allowed(wall.tier, wall.probeReport["p2"]))
        # ruling 2: resolved rights come from the measured tier
        self.assertEqual(wall.provenance["resolved"], wall.tier == "CT")

    def test_c_p2_is_a_real_lean_type_error(self):
        get_lean_wall()
        p2 = _events(_STATE["hist"], "capability.probe.p2")[-1]["payload"]
        self.assertTrue(p2["ran"])
        self.assertIn('example : Nat := "s"', p2["request"]["injected"],
                      "the profile injection must be the real lean type error")
        self.assertEqual(p2["verdict"], "pass",
                         "the elaborator stopped flagging the injected type "
                         "error")
        errors = [d for d in p2["response"] if d.get("severity") == 1]
        self.assertTrue(errors, "no severity-1 diagnostic came back")
        # the evidence is a TYPE error from the elaborator, not a parse error
        # (the reason the profile declares p2Injection at all)
        self.assertTrue(any("Type mismatch" in d.get("message", "")
                            for d in errors),
                        f"no type-mismatch evidence in {errors!r}")
        verdicts = _events(_STATE["hist"], "capability.probe.p2.verdict")
        self.assertEqual(verdicts[-1]["payload"]["p2"], "pass")

    def test_d_probe_consequences_documented_not_hidden(self):
        get_lean_wall()
        by_id = {r["id"]: r for r in _STATE["dump"]["battery"]["results"]}
        # P6: measured consequence of the ybg-shaped scratch doc — `lib.` at
        # COMMAND position is not a term context in lean, so completion
        # returns zero items.  An honest FAIL, never silently upgraded.
        self.assertEqual(by_id["P6"]["verdict"], "fail")
        self.assertIn("no typed members", by_id["P6"]["evidence"])
        # P3 skips for a structural reason (lean has no `let x = …` line)
        self.assertEqual(by_id["P3"]["verdict"], "skip")
        # cross-file semantics MEASURED live through the profile's own
        # call-surface patterns (`f (x)` — lean application is whitespace-
        # sensitive; the ybg `name(` shape is a lean parse error)
        self.assertEqual(by_id["P4"]["verdict"], "pass")
        self.assertEqual(by_id["P5"]["verdict"], "pass")
        self.assertEqual(by_id["P7"]["verdict"], "pass")
        # P8 via semanticTokens, P9 via call hierarchy — both advertised and
        # both answered (unlike the python run, where P8 skipped)
        self.assertEqual(by_id["P8"]["verdict"], "pass")
        self.assertEqual(by_id["P9"]["verdict"], "pass")
        # stage H recorded its sources + the non-uniformity cap; for lean the
        # on-demand inventory is EMPTY (same command-position consequence as
        # P6) — reduced to nothing, and DOCUMENTED as such, never faked
        nonuni = _events(_STATE["hist"], "capability.lib.nonuniform")
        self.assertEqual(len(nonuni), 1)
        self.assertIn("ondemand-completion", nonuni[0]["payload"]["sources"])
        self.assertEqual(_STATE["dump"]["libInventory"]["ondemand"], [],
                         "lean's ybg-shaped scratch completion unexpectedly "
                         "returned items — re-measure and re-document")

    def test_e_no_grammar_floor_bound_is_visible(self):
        # the stub tree-sitter runtime has no .lean grammar: lean has NO G
        # fallback this round.  That bound must be visible, not silent: the
        # discovery grammar lead says so verbatim.
        get_lean_wall()
        grammar = _events(_STATE["hist"], "capability.discovery.grammar")
        self.assertEqual(len(grammar), 1)
        self.assertIn("NOT wired", grammar[0]["payload"]["source"])
        floor_leads = _events(_STATE["hist"], "capability.floor.parse")
        self.assertEqual(floor_leads, [],
                         "no stub grammar should have parsed .lean")

    def test_f_toolchain_pinned_and_encoding_measured(self):
        get_lean_wall()
        # the toolchain PIN rides the spawn argv (elan shim `+<toolchain>`):
        # elan's default 'stable' drifts, so an unpinned spawn could silently
        # change the thing being measured
        pin = "+" + cap_mod.LEAN_TOOLCHAIN
        self.assertEqual(cap_mod.LEAN_TOOLCHAIN, "leanprover/lean4:v4.32.0")
        for lead in ("capability.wire.prepare", "capability.wire.spawn"):
            argv = _events(_STATE["hist"], lead)[0]["payload"]["argv"]
            self.assertIn(pin, argv, f"{lead} argv is not toolchain-pinned")
        # positionEncoding: lean advertises none and speaks utf-16 — the
        # spine's negotiated default matches (per-profile encoding is
        # MEASURED state, visible in the dump)
        self.assertEqual(_STATE["dump"]["shimState"]["positionEncoding"],
                         "utf-16")
        self.assertEqual(_STATE["dump"]["shimState"]["serverInfo"].get("name"),
                         "Lean 4 Server")


if __name__ == "__main__":
    unittest.main()
