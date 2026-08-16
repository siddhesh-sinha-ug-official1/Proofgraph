"""REAL-INPUTS suite part 2 — real lean toolchain source, identity + shape
(SUB200 split of test_real_inputs.py; tests verbatim, sessions from
ow_real_shared; the class's semantics half continues in
test_real_inputs_lean_semantics.py — 12 lean tests total, unchanged).

Run standalone or via the test_real_inputs.py aggregator.
"""
from __future__ import annotations

import unittest
from collections import Counter

import ow_real_shared as shared

import outerwall

LEAN: dict
LEAN_BYTES: bytes
LEAN2_BYTES: bytes


def setUpModule():
    global LEAN, LEAN_BYTES, LEAN2_BYTES
    LEAN = shared.lean_session()
    LEAN_BYTES = shared.lean_bytes()
    LEAN2_BYTES = shared.lean2_bytes()


class Test02RealLeanToolchainSource(unittest.TestCase):
    """Three REAL toolchain-source files at CT: 58 kernel greens, a dense
    resolved proof_uses DAG, zero leads — and the collision regression."""

    def test_two_independent_runs_byte_identical(self):
        """ID STABILITY + kernel determinism: two fully independent runs
        (fresh capability battery, fresh driver invocations) byte-compare
        EQUAL — including every run=<sha16> attestation, which pins the
        driver's stdout as deterministic on these inputs."""
        self.assertEqual(LEAN_BYTES, LEAN2_BYTES)
        self.assertGreater(len(LEAN_BYTES), 1000)

    def test_graph_well_formed_against_canonical_schema(self):
        conforms, errors = outerwall.validate_graph(LEAN["analysis"]["graph"])
        self.assertTrue(conforms, errors)

    def test_shape_frozen_kernel_clean_world(self):
        """The measured shape, frozen: 61 nodes (58 kernel greens: 42
        Classical + 9 SizeOfLemmas + 7 ByCases; 3 unknown module nodes),
        45 resolved proof_uses edges, ZERO leads, zero amber/red (all three
        files are kernel-clean toolchain source)."""
        g = LEAN["analysis"]["graph"]
        self.assertEqual(len(g["nodes"]), 61)
        fills = Counter(n["fill"]["status"] for n in g["nodes"])
        self.assertEqual(fills, Counter({"green": 58, "unknown": 3}))
        greens_per_file = Counter(n["span"]["file"] for n in g["nodes"]
                                  if n["fill"]["status"] == "green")
        self.assertEqual(greens_per_file,
                         Counter({"Classical.lean": 42,
                                  "SizeOfLemmas.lean": 9,
                                  "ByCases.lean": 7}))
        # the 3 unknowns are exactly the module nodes (not kernel-judged)
        for n in g["nodes"]:
            if n["fill"]["status"] == "unknown":
                self.assertEqual(n["kind"], "module", n["name"])
        self.assertEqual(len(g["edges"]), 45)
        self.assertTrue(all(e["kind"] == "proof_uses"
                            and e["resolved"] is True
                            and e["resolver"] == "lean-kernel"
                            for e in g["edges"]))
        self.assertEqual(g["leads"], [])

    def test_every_green_attested_with_its_own_decl(self):
        """Verdicts consistent with the checker's ACTUAL output: every green
        carries origin=checked + a lean-kernel v4.31.0 attestation whose
        decl= names THE NODE'S OWN declaration (written-identifier suffix of
        the resolved name) — a crossed decl= is the regressed matcher bug."""
        for n in LEAN["analysis"]["graph"]["nodes"]:
            if n["fill"]["status"] != "green":
                continue
            self.assertEqual(n["origin"], "checked", n["name"])
            src = n["fill"]["source"]
            self.assertTrue(src.startswith(
                "lean-kernel:v4.31.0:kernelAccepted "), src)
            decl = src.split("decl=")[1].split(" ")[0]
            stem = n["span"]["file"].rsplit(".", 1)[0]     # e.g. 'Classical'
            ident = n["name"][len(stem) + 1:]              # written identifier
            # the matcher's own invariant: the attested decl is the node's
            # written identifier, exactly or as a dotted suffix
            self.assertTrue(decl == ident or decl.endswith("." + ident),
                            (n["name"], decl))

    def test_run_sha_resolves_to_probed_driver_invocation(self):
        """The evidence chain: each green's run=<sha16> resolves to a probed
        extractor.backend.leanDriver.resp invocation for THAT node's file —
        green BECAUSE the kernel verified it, never a style."""
        resp = [e for e in LEAN["extractorWall"].pins.history()
                if e.get("probeId") == "extractor.backend.leanDriver.resp"]
        self.assertEqual(len(resp), 3)      # one invocation per real file
        sha_by_file = {e["payload"]["file"]: e["payload"]["runSha"]
                       for e in resp}
        for n in LEAN["analysis"]["graph"]["nodes"]:
            if n["fill"]["status"] != "green":
                continue
            run_sha = n["fill"]["source"].split("run=")[-1].strip()
            self.assertTrue(
                sha_by_file[n["span"]["file"]].startswith(run_sha),
                (n["name"], run_sha))


if __name__ == "__main__":
    unittest.main(verbosity=2)
