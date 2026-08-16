"""LEAN-DOCK round — the CT kernel-driver path made executable.

What is pinned here (mission worklist items 1+2):
  * genuine kernel-verified GREEN exists in the envelope: fill green ONLY with
    origin "checked" + a lean-kernel attestation naming the driver evidence;
  * sorry -> amber, NEVER green; a decl absent from decls[] is NEVER green;
  * the resolved proof_uses edge comes from decls[].refs (kernel driver),
    filtered to the ingested decl set — every drop probed, never silent;
  * unusedHypotheses ride as probed per-decl payloads + a ceiling summary;
  * the driver's limits[] ride the honestCeiling VERBATIM.

SUB200 restructure: the guard tests (verdict mapping, forged green, driver
dead) live in test_lean_ct_guards.py; the decl-matching tests in
test_lean_decl_match.py.  Total test count unchanged.
"""
import unittest

from harness import one_payload, payloads, run_lang
from lean_ct_common import skip_without_lean

from extractor.docks import reasons as R


class TestLeanCtPath(unittest.TestCase):
    """One real driver run over fixtures/lean_ct (clean chain + sorry +
    unused hypothesis), all assertions on fills/edges/probes."""

    @classmethod
    def setUpClass(cls):
        skip_without_lean()
        cls.cell = run_lang("lean_ct")
        cls.state = cls.cell.dump()
        cls.nodes = {n["name"]: n for n in cls.state["nodes"]}

    def test_green_fills_are_kernel_attested(self):
        for name in ("Verified.base_fact", "Verified.uses_base",
                     "Verified.unused_hyp_case"):
            n = self.nodes[name]
            self.assertEqual(n["fill"]["status"], "green", name)
            self.assertEqual(n["origin"], "checked", name)
            self.assertTrue(n["fill"]["source"].startswith("lean-kernel:v"), name)
            self.assertIn(":kernelAccepted", n["fill"]["source"], name)
            self.assertIn("run=", n["fill"]["source"],
                          "green must cite the driver evidence (runSha)")

    def test_sorry_is_amber_never_green(self):
        n = self.nodes["Verified.sorry_case"]
        self.assertEqual(n["fill"]["status"], "amber")
        self.assertNotEqual(n["fill"]["status"], "green")
        self.assertEqual(n["origin"], "checked")
        self.assertIn("sorryAx", n["fill"]["source"],
                      "the amber source must NAME sorry")

    def test_module_unjudged_stays_unknown(self):
        # the module is not a kernel-judged unit in a clean file: unknown
        n = self.nodes["Verified"]
        self.assertEqual(n["fill"]["status"], "unknown")
        self.assertEqual(n["origin"], "assumed")

    def test_resolved_proof_uses_edge_from_driver_refs(self):
        src = self.nodes["Verified.uses_base"]["id"]
        dst = self.nodes["Verified.base_fact"]["id"]
        hits = [e for e in self.state["edges"]
                if e["kind"] == "proof_uses" and e["srcId"] == src
                and e["dstId"] == dst]
        self.assertEqual(len(hits), 1, "the kernel-resolved chain edge")
        e = hits[0]
        self.assertIs(e["resolved"], True)
        self.assertEqual(e["resolver"], "lean-kernel")
        self.assertEqual(e["provenance"], {"tier": "T2", "extractor": "lean-driver"})
        # §5.4: the matching resolved decision exists, with the driver reason
        dec = [d for d in self.state["decisions"]["lean"]
               if d["outcome"] == "resolved" and d["candidate"]["kind"] == "proof_uses"]
        self.assertEqual(len(dec), 1)
        self.assertEqual(dec[0]["reason"], R.R_LEAN_DRIVER)
        self.assertEqual(dec[0]["boundDstId"], dst)

    def test_out_of_project_refs_are_probed_rejections_never_silent(self):
        rejected = [d for d in self.state["decisions"]["lean"]
                    if d["outcome"] == "rejected"]
        core = [d for d in rejected if d["reason"] == R.X_CORE]
        self.assertTrue(core, "core-constant drops must be probed rejections")
        names = {d["candidate"]["dstName"] for d in core}
        self.assertIn("rfl", names)             # base_fact's proof term
        self.assertIn("Init", names)            # the implicit prelude import
        # every rejection also fired the rejected-edge probe
        probed = payloads(self.cell, "extractor.t2.lean.edge.rejected")
        self.assertEqual(len(probed), len(rejected))
        # and nothing rejected leaked into the edge set
        self.assertEqual(len(self.state["edges"]),
                         len([d for d in self.state["decisions"]["lean"]
                              if d["outcome"] != "rejected"]))

    def test_unused_hypothesis_probed_payload_and_summary(self):
        per_decl = {p["decl"]: p["binders"]
                    for p in payloads(self.cell, "extractor.t2.lean.unusedHyp")}
        self.assertEqual(per_decl["unused_hyp_case"], ["h2"])
        self.assertEqual(per_decl["uses_base"], [])   # its proof USES base_fact
        summary = one_payload(self.cell, "extractor.t2.lean.unusedHyp.summary")
        self.assertEqual(summary["perDecl"],
                         {"Verified.unused_hyp_case": ["h2"]})
        self.assertEqual(summary["totalFlagged"], 1)
        # the summary RIDES the envelope inside the lean honest ceiling
        ceiling = self.state["honestCeilings"][0]
        self.assertEqual(ceiling["unusedHypothesesSummary"], summary)

    def test_driver_limits_ride_ceiling_verbatim(self):
        resp = one_payload(self.cell, "extractor.backend.leanDriver.resp")
        ceiling = self.state["honestCeilings"][0]
        self.assertEqual(ceiling["driverLimits"], resp["doc"]["limits"],
                         "limits[] must ride VERBATIM")
        self.assertTrue(any("single-file driver" in l
                            for l in ceiling["driverLimits"]),
                        "the single-file bound must be declared")

    def test_invocation_and_latency_probed(self):
        invokes = payloads(self.cell, "extractor.t2.lean.driver.invoke")
        self.assertEqual(len(invokes), 1)          # one file, one invocation
        self.assertIn("Driver.lean", " ".join(invokes[0]["cmd"]))
        timing = payloads(self.cell, "extractor.t2.lean.driver.timing")
        self.assertEqual(len(timing), 1)
        self.assertGreater(timing[0]["wallNanos"], 0)
        reqs = payloads(self.cell, "extractor.backend.leanDriver.req")
        resps = payloads(self.cell, "extractor.backend.leanDriver.resp")
        self.assertEqual(len(reqs), len(resps))

    def test_toolchain_divergence_declared_not_unified(self):
        div = one_payload(self.cell, "extractor.t2.lean.toolchain.divergence")
        self.assertIn("v4.31.0", div["driverPin"])
        self.assertIn("v4.32.0", div["capabilityPin"])
        self.assertIn("declared-not-unified", div["action"])
        ceiling = self.state["honestCeilings"][0]
        self.assertEqual(ceiling["toolchainPinDivergence"], div)

    def test_verdict_probes_cover_every_decl(self):
        verdicts = {p["decl"]: p["verdict"]
                    for p in payloads(self.cell, "extractor.t2.lean.verdict")}
        self.assertEqual(verdicts, {
            "base_fact": "green", "uses_base": "green",
            "unused_hyp_case": "green", "sorry_case": "amber"})

    def test_ct_history_deterministic(self):
        h1 = run_lang("lean_ct").history(strip_wall=True)
        h2 = run_lang("lean_ct").history(strip_wall=True)
        self.assertEqual(h1, h2, "CT lean history must be deterministic "
                                 "(driver stdout, runSha, verdicts)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
