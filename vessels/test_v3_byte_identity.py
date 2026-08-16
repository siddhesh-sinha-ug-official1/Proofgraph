"""V3 connector suite (split 1/4): byte identity across the seam + THE
node-preimage gap closure (the seam test the graph-model wall spec promised).

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
from v3_seam_shared import (as_bytes, byte_set, bundles,       # noqa: E402
                            gm_payloads, ids, sx_payloads)


def setUpModule():
    st.ensure_bundles()


class TestByteIdentityAcrossSeam(unittest.TestCase):
    """Every Node.id and Edge.id in the extractor's envelope appears
    BYTE-identical in graph-model's accepted graph AND in both pin streams
    (extractor t1/assemble pins x model wall ingest/verify pins)."""

    def test_node_ids_byte_identical_envelope_pins_accepted(self):
        for b in bundles():
            with self.subTest(fixture=b.name):
                env_ids = byte_set(n["id"] for n in b.env["nodes"])
                self.assertTrue(env_ids, "vacuity guard: fixture has nodes")
                # extractor pin stream: t1.node.id carries every minted id
                sx_pin_ids = byte_set(
                    p["id"] for p in sx_payloads(b.sx, "extractor.t1.node.id"))
                self.assertEqual(env_ids, sx_pin_ids)
                # model accepted graph (pin surface: pins.dump()['wall'])
                gm_ids = byte_set(n["id"] for n in b.accepted["nodes"])
                self.assertEqual(env_ids, gm_ids)
                # model verify pin: counted them all, passed, named nothing
                v = gm_payloads(b.gm, "graph-model.wall.ingest.verify.nodeIds")
                self.assertEqual(len(v), 1)
                self.assertEqual(v[0]["checked"], len(b.env["nodes"]))
                self.assertTrue(v[0]["pass"])
                self.assertEqual(v[0]["formatViolations"], [])
                self.assertEqual(v[0]["duplicates"], [])

    def test_edge_and_lead_ids_byte_identical_envelope_pins_accepted(self):
        for b in bundles():
            with self.subTest(fixture=b.name):
                env_edge_ids = byte_set(e["id"] for e in b.env["edges"])
                env_lead_ids = byte_set(l["id"] for l in b.env["leads"])
                self.assertTrue(env_edge_ids,
                                "vacuity guard: fixture has resolved edges")
                # extractor pin stream: assemble.edge.id fires per normalized
                # candidate; duplicates collapse in the set (dedup probed)
                sx_pin_ids = byte_set(
                    p["edgeId"] for p in
                    sx_payloads(b.sx, "extractor.assemble.edge.id"))
                self.assertEqual(env_edge_ids | env_lead_ids, sx_pin_ids)
                # model accepted graph
                self.assertEqual(env_edge_ids,
                                 byte_set(e["id"] for e in b.accepted["edges"]))
                self.assertEqual(env_lead_ids,
                                 byte_set(l["id"] for l in b.accepted["leads"]))
                # model verify pin: every edge AND lead id recomputed, zero
                # mismatches
                v = gm_payloads(b.gm, "graph-model.wall.ingest.verify.edgeIds")
                self.assertEqual(len(v), 1)
                self.assertEqual(v[0]["checked"],
                                 len(b.env["edges"]) + len(b.env["leads"]))
                self.assertTrue(v[0]["pass"])
                self.assertEqual(v[0]["mismatches"], [])

    def test_declared_counts_agree_pin_x_pin(self):
        """extractor.wall.extract.return (cell 3's declared envelope counts)
        == graph-model.wall.ingest.accepted (cell 1's accepted counts) —
        the cross-boundary count reconciliation, pin x pin."""
        for b in bundles():
            with self.subTest(fixture=b.name):
                ret = sx_payloads(b.sx, "extractor.wall.extract.return")
                acc = gm_payloads(b.gm, "graph-model.wall.ingest.accepted")
                self.assertEqual(len(ret), 1)
                self.assertEqual(len(acc), 1)
                self.assertEqual(ret[0]["nodes"], acc[0]["nodeCount"])
                self.assertEqual(ret[0]["edges"], acc[0]["edgeCount"])
                self.assertEqual(ret[0]["leads"], acc[0]["leadCount"])
                self.assertEqual(b.ingest_result["accepted"], True)
                self.assertEqual(acc[0]["rootIds"], b.roots)


class TestNodePreimageGapClosed(unittest.TestCase):
    """THE seam test the graph-model wall spec promised (MEMBRANE-SPEC
    'Node-preimage bound'): the model wall verifies node ids by format +
    uniqueness ONLY — it cannot recompute preimages from Node fields alone.
    The extractor's extractor.t1.node.id pins carry the preimages; recompute
    each id from that pinned material via the CANONICAL mint
    (packages/schema/ids.py) and byte-compare against what graph-model
    accepted.  Full coverage in both directions: every accepted id has a
    pinned preimage that recomputes to it; every pinned id was accepted."""

    def test_every_accepted_node_id_recomputes_from_pinned_preimage(self):
        for b in bundles():
            with self.subTest(fixture=b.name):
                accepted_ids = byte_set(n["id"] for n in b.accepted["nodes"])
                pin_payloads = sx_payloads(b.sx, "extractor.t1.node.id")
                self.assertTrue(pin_payloads, "vacuity guard")
                recomputed_ids = set()
                for p in pin_payloads:
                    pre = p["preimage"]
                    joined = ids.node_preimage(
                        pre["lang"], pre["kind"], pre["canonicalName"],
                        pre["file"], pre["path"])
                    # the pin's escaped 'joined' field is that exact preimage
                    self.assertEqual(
                        joined.replace(ids.US, ids.US_ESCAPED), pre["joined"])
                    nid = ids.node_id_from_preimage(joined)
                    # byte-compare recomputed vs pinned vs accepted
                    self.assertEqual(as_bytes(nid), as_bytes(p["id"]))
                    self.assertIn(as_bytes(nid), accepted_ids)
                    recomputed_ids.add(as_bytes(nid))
                # both directions: no accepted node lacks a verified preimage
                self.assertEqual(recomputed_ids, accepted_ids)

    def test_every_accepted_edge_id_recomputes_under_canonical_mint(self):
        """Edges/leads: the model wall DOES recompute these itself (its
        verify.edgeIds pin, asserted above); the vessel independently
        recomputes from the extractor's assemble pins so the two membranes'
        mints are proven byte-agreeing on this run's real ids."""
        for b in bundles():
            with self.subTest(fixture=b.name):
                accepted = {as_bytes(e["id"])
                            for e in b.accepted["edges"] + b.accepted["leads"]}
                for row in b.env["edges"] + b.env["leads"]:
                    eid = ids.compute_edge_identity(
                        row["kind"], row["srcId"], row["dstId"])["edgeId"]
                    self.assertEqual(as_bytes(eid), as_bytes(row["id"]))
                    self.assertIn(as_bytes(eid), accepted)


if __name__ == "__main__":
    unittest.main(verbosity=2)
