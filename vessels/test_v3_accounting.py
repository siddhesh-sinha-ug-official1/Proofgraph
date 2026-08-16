"""V3 connector suite (split 2/4): leads stay leads + no silent drops.

Part of the vessels/test_v3_extractor_to_model.py aggregate (SUB200
restructure); shared bundles/helpers live in vessels/v3_seam_shared.py.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

VESSELS = Path(__file__).resolve().parent
if str(VESSELS) not in sys.path:
    sys.path.insert(0, str(VESSELS))

import v3_seam_shared as st                                    # noqa: E402
from v3_seam_shared import (bundles, gm_payloads, ids,         # noqa: E402
                            sx_payloads)


def setUpModule():
    st.ensure_bundles()


class TestLeadsStayLeads(unittest.TestCase):
    """resolved=false stays a lead through BOTH walls: never in edges[],
    'unresolved:' prefix intact, and the two cells' lead pin sets are equal
    (set equality on ids)."""

    def test_leads_through_both_walls(self):
        self.assertTrue(st.RICH.env["leads"],
                        "vacuity guard: rich fixture must carry leads")
        for b in bundles():
            with self.subTest(fixture=b.name):
                env_lead_ids = {l["id"] for l in b.env["leads"]}
                env_edge_ids = {e["id"] for e in b.env["edges"]}
                self.assertEqual(env_lead_ids & env_edge_ids, set())

                # extractor pins: each lead normalized as resolved=False with
                # the placeholder probed
                sx_norm = sx_payloads(b.sx, "extractor.assemble.edge.normalize")
                sx_lead_ids = {p["schemaEdge"]["id"] for p in sx_norm
                               if p["schemaEdge"]["resolved"] is False}
                self.assertEqual(sx_lead_ids, env_lead_ids)
                placeholders = {p["placeholderId"] for p in sx_payloads(
                    b.sx, "extractor.assemble.edge.unresolved.placeholder")}
                for l in b.env["leads"]:
                    self.assertIs(l["resolved"], False)
                    self.assertTrue(l["dstId"].startswith("unresolved:"))
                    self.assertIn(l["dstId"], placeholders)

                # model pins: lead set equality on ids, prefix intact, and no
                # resolved=false row hiding in the accepted edges[]
                gm_lead_ids = {l["id"] for l in b.accepted["leads"]}
                self.assertEqual(gm_lead_ids, sx_lead_ids)
                for l in b.accepted["leads"]:
                    self.assertIs(l["resolved"], False)
                    self.assertTrue(l["dstId"].startswith("unresolved:"))
                for e in b.accepted["edges"]:
                    self.assertIs(e["resolved"], True)
                v = gm_payloads(b.gm, "graph-model.wall.ingest.verify.leads")
                self.assertEqual(len(v), 1)
                self.assertEqual(v[0]["checked"], len(b.env["leads"]))
                self.assertTrue(v[0]["pass"])
                self.assertEqual(v[0]["violations"], [])


class TestNoSilentDrops(unittest.TestCase):
    """Every extracted node/edge/lead is either in the ingested graph or
    named-rejected in a pin; counts reconciled EXACTLY across both cells'
    pins."""

    def test_node_accounting(self):
        for b in bundles():
            with self.subTest(fixture=b.name):
                emitted = sx_payloads(b.sx, "extractor.t1.node.emit")
                rejects = sx_payloads(b.sx, "extractor.t1.node.reject")
                # every emit crossed the seam; every non-promotion is NAMED
                self.assertEqual(len(emitted), len(b.env["nodes"]))
                for r in rejects:
                    self.assertTrue(r["reason"])      # named, never silent
                    self.assertIn("span", r)
                # model side: accepted == emitted, verified count matches
                acc = gm_payloads(b.gm, "graph-model.wall.ingest.accepted")[0]
                self.assertEqual(acc["nodeCount"], len(emitted))
                v = gm_payloads(b.gm,
                                "graph-model.wall.ingest.verify.nodeIds")[0]
                self.assertEqual(v["checked"], len(emitted))

    def test_edge_accounting(self):
        for b in bundles():
            with self.subTest(fixture=b.name):
                decisions = [d for per_lang in
                             b.sx.pins.dump()["decisions"].values()
                             for d in per_lang]
                kept = [d for d in decisions if d["outcome"] != "rejected"]
                rejected = [d for d in decisions if d["outcome"] == "rejected"]
                # every rejected candidate is NAMED in the decision pin surface
                for d in rejected:
                    self.assertTrue(d["reason"])
                    self.assertIn("candidate", d)
                # every kept decision minted exactly the envelope id set
                # (dedup collapses identical ids; the drop itself is probed)
                minted = {ids.compute_edge_identity(
                    d["candidate"]["kind"], d["candidate"]["srcId"],
                    d["boundDstId"])["edgeId"] for d in kept}
                env_ids = ({e["id"] for e in b.env["edges"]} |
                           {l["id"] for l in b.env["leads"]})
                self.assertEqual(minted, env_ids)
                norm = sx_payloads(b.sx, "extractor.assemble.edge.normalize")
                dedup = sx_payloads(b.sx, "extractor.assemble.edge.dedup")
                self.assertEqual(len(norm), len(kept))
                self.assertEqual(len(norm) - len(dedup), len(env_ids))
                # assemble's own output pin agrees with the envelope split
                emit = sx_payloads(b.sx, "extractor.assemble.graph.emit")[0]
                self.assertEqual(emit["resolvedEdges"], len(b.env["edges"]))
                self.assertEqual(emit["unresolvedLeads"], len(b.env["leads"]))
                self.assertEqual(emit["nodeCount"], len(b.env["nodes"]))
                # model side: accepted counts equal, per its own pins
                acc = gm_payloads(b.gm, "graph-model.wall.ingest.accepted")[0]
                self.assertEqual(acc["edgeCount"], len(b.env["edges"]))
                self.assertEqual(acc["leadCount"], len(b.env["leads"]))
                self.assertEqual(
                    len(b.accepted["edges"]) + len(b.accepted["leads"]),
                    len(env_ids))


if __name__ == "__main__":
    unittest.main(verbosity=2)
