"""Gate 15 — WALL conformance: pins vs face (Phase-1, WALL-CONVENTIONS.md).

Drives the wall (packages/capability-layer/wall.py), then reads the cell's
PINS (probe stream / dump) and asserts that every field the wall DECLARES
equals the pin-level truth — declared behavior may never diverge from probed
behavior.  This file carries the no-pipeline statics; the driven-run
conformance classes (CT and fake-green) live in test_15b_wall_runs.py, and
the shared exec-loader lives in wall_common.py.  Together the two files
prove:

  * the schema-PIN gate is live (negative cases raise schema-pin-mismatch);
  * unknown languages surface a TYPED refusal — known=False, tier=None,
    honestCeiling 'no profile — tier unknown' — never a fabricated tier,
    never a crash (this is where "unknown surfaces unknown" enters the
    organism);
  * the fake-green protections hold THROUGH the wall (zigish: paper CT,
    measured S, greenAllowed False);
  * shutdown() terminates the live LSP child — no leaked process;
  * one-run-at-a-time is enforced (concurrent-run-unsupported).

Loading strategy: wall.py lives at the package ROOT (outside capability/), so
it is loaded by file-read + exec — the same canonical-as-data pattern as
test_13_schema_sync — keeping importgate.py's ALLOWED lists honest and
unchanged.
"""

import sys
import unittest

import capability.capability               # noqa: F401  (ensure submodule)
from capability import probes
from capability.tests.wall_common import WALL

# the module, not the function (the package __init__ rebinds the name)
cap_mod = sys.modules["capability.capability"]


class TestWallStatics(unittest.TestCase):
    """No pipeline run needed: version, catalog growth, pin gate, refusals."""

    def test_wall_version(self):
        self.assertEqual(WALL["WALL_VERSION"], "capability-layer-wall/1.0.0")

    def test_catalog_extended_never_shrunk(self):
        ids = {e["probeId"] for e in probes.probeCatalog()}
        for lead in ("capability.wall.construct", "capability.wall.refusal",
                     "capability.wall.shutdown"):
            self.assertIn(lead, ids, f"wall lead {lead} not catalogued")
        # every pre-wall mandated lead is still present (additive only)
        from capability.tests.test_12_catalog import REQUIRED_LEADS
        missing = [x for x in REQUIRED_LEADS if x not in ids]
        self.assertEqual(missing, [])
        self.assertGreaterEqual(len(ids), 88 + 3)

    def test_schema_pin_positive(self):
        pin = WALL["_check_schema_pin"]()
        self.assertEqual(pin, {"schemaVersion": "v0",
                               "schemaHash": WALL["PINNED_SCHEMA_HASH"]})

    def test_schema_pin_gate_is_live_wrong_hash(self):
        with self.assertRaises(WALL["WallRefusal"]) as ctx:
            WALL["_check_schema_pin"](pinned_hash="0" * 64)
        self.assertEqual(ctx.exception.failureClass, "schema-pin-mismatch")

    def test_schema_pin_gate_is_live_wrong_version(self):
        with self.assertRaises(WALL["WallRefusal"]) as ctx:
            WALL["_check_schema_pin"](pinned_version="v1")
        self.assertEqual(ctx.exception.failureClass, "schema-pin-mismatch")

    def test_unknown_language_is_a_typed_refusal_not_a_crash(self):
        seen = []
        untap = probes.tap("capability.wall.refusal", seen.append)
        before = len(cap_mod.history())
        try:
            notice = WALL["capability_wall"]("klingon")
        finally:
            untap()
        self.assertIs(notice.known, False)
        self.assertEqual(notice.failureClass, "unknown-language")
        self.assertEqual(notice.honestCeiling, "no profile — tier unknown")
        self.assertIsNone(notice.tier, "a fabricated tier leaked through")
        self.assertEqual(notice.lang, "klingon")
        self.assertEqual(notice.wallVersion, WALL["WALL_VERSION"])
        # the refusal is a LEAD (tap-observable), and it polluted no run's pins
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0]["payload"]["failureClass"], "unknown-language")
        self.assertEqual(len(cap_mod.history()), before,
                         "refusal must not touch the cell's last-run stream")

    def test_concurrent_run_is_refused_with_named_class(self):
        lock = WALL["_RUN_LOCK"]
        self.assertTrue(lock.acquire(blocking=False), "run lock already held?")
        seen = []
        untap = probes.tap("capability.wall.refusal", seen.append)
        try:
            with self.assertRaises(WALL["WallRefusal"]) as ctx:
                WALL["capability_wall"]("awk")
            self.assertEqual(ctx.exception.failureClass,
                             "concurrent-run-unsupported")
            self.assertEqual(len(seen), 1)
            self.assertEqual(seen[0]["payload"]["failureClass"],
                             "concurrent-run-unsupported")
        finally:
            untap()
            lock.release()


if __name__ == "__main__":
    unittest.main()
