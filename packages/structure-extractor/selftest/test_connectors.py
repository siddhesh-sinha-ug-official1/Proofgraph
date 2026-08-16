"""Every connector is tested, even the cheap ones (Operating Contract 4) —
the connectors that die are the elementary-but-fiddly ones."""
import json
import unittest

from harness import RECORDING, one_payload, payloads, run_lang, run_rich

from extractor.capability import stub_capability
from extractor.docks.pyright_backend import (RecordedPyrightBackend,
                                             byte_offset_to_position,
                                             position_to_byte_offset,
                                             _uri_to_path)
from extractor.schema import edge_id, node_id, unresolved_placeholder


class TestCheapWires(unittest.TestCase):
    def test_grimp_wire(self):
        import sys
        from harness import FIXTURES
        import grimp
        sys.path.insert(0, str(FIXTURES / "python"))
        try:
            g = grimp.build_graph("pkg", cache_dir=None)
        finally:
            sys.path.remove(str(FIXTURES / "python"))
        self.assertIn("pkg.a", g.modules)
        self.assertEqual(g.find_modules_directly_imported_by("pkg.a"), {"pkg.b"})

    def test_capability_handle_wire(self):
        self.assertEqual(stub_capability("python").tier, "CT")
        # LEAN-DOCK round: the stub now honestly reports lean -> CT (the
        # kernel driver is reachable in this environment, mirroring python);
        # the REAL negotiated tier still comes from cell 2 via the V1 feed.
        lean_cap = stub_capability("lean")
        self.assertEqual(lean_cap.tier, "CT")
        self.assertTrue(lean_cap.allows_resolution())
        for lang in ("latex", "typst", "go", "c", "cpp"):
            cap = stub_capability(lang)
            self.assertEqual(cap.tier, "G", lang)
            self.assertFalse(cap.allows_resolution(), lang)

    def test_position_conversion_roundtrip(self):
        data = b"from pkg import b\n\nVALUE = b.NAME\n"
        for off in (0, 5, 18, 19, 27, len(data) - 1):
            line, ch = byte_offset_to_position(data, off)
            self.assertEqual(position_to_byte_offset(data, line, ch), off)

    def test_uri_to_path_windows_drive(self):
        p = _uri_to_path("file:///A:/x/y.py")
        self.assertEqual(str(p).replace("\\", "/"), "A:/x/y.py")

    def test_recorded_backend_replay(self):
        recording = json.loads(RECORDING.read_text(encoding="utf8"))
        self.assertTrue(recording.get("responses"), "recording fixture must not be empty")
        backend = RecordedPyrightBackend(recording, dict(recording["files"]))
        key = next(iter(sorted(recording["responses"])))
        rel, line, ch = key.rsplit(":", 2)
        self.assertEqual(backend.definitions(rel, int(line), int(ch)),
                         recording["responses"][key])
        self.assertIsNone(backend.definitions("nope.py", 0, 0))

    def test_recording_covers_all_rich_queries(self):
        cell = run_rich()
        for decisions in cell.dump()["decisions"].values():
            for d in decisions:
                self.assertNotIn("no recorded response", d.get("note", ""),
                                 f"recording drift: {d['candidate']['dstName']}")

    def test_stale_recording_is_refused(self):
        # review C1: a recording captured from different bytes must never replay
        import json as _json
        from extractor.docks.pyright_backend import (RecordedPyrightBackend,
                                                     StaleRecordingError)
        recording = _json.loads(RECORDING.read_text(encoding="utf8"))
        self.assertIn("files", recording, "recording must be v2 (with per-file shas)")
        good_shas = dict(recording["files"])
        RecordedPyrightBackend(recording, good_shas)  # matching shas: accepted
        bad = dict(good_shas)
        first = sorted(bad)[0]
        bad[first] = "0" * 16
        with self.assertRaises(StaleRecordingError):
            RecordedPyrightBackend(recording, bad)
        with self.assertRaises(StaleRecordingError):
            RecordedPyrightBackend({"flat": "pre-v2"}, good_shas)

    def test_id_wires_deterministic(self):
        # Canonical mint (assembly ruling 5): ids hash the structural locator,
        # and edge/node ids carry the n_/e_ 16-hex canonical form.
        e1, _ = edge_id("calls", "n_aaaaaaaaaaaaaaaa", "n_bbbbbbbbbbbbbbbb")
        e2, _ = edge_id("calls", "n_aaaaaaaaaaaaaaaa", "n_bbbbbbbbbbbbbbbb")
        self.assertEqual(e1, e2)
        self.assertRegex(e1, r"^e_[0-9a-f]{16}$")
        n1, _ = node_id("python", "module", "pkg.a", "pkg/a.py", "pkg.a")
        n2, _ = node_id("python", "module", "pkg.a", "pkg/a.py", "pkg.a")
        self.assertEqual(n1, n2)
        self.assertRegex(n1, r"^n_[0-9a-f]{16}$")
        # Assembly ruling 6: placeholder = "unresolved:" + RAW name, never hashed
        p = unresolved_placeholder("os.path.join")
        self.assertEqual(p, "unresolved:os.path.join")
        self.assertEqual(p, unresolved_placeholder("os.path.join"))

    def test_backend_reqresp_pairs_probed(self):
        cell = run_rich()
        reqs = payloads(cell, "extractor.backend.pyright.req")
        resps = payloads(cell, "extractor.backend.pyright.resp")
        self.assertEqual(len(reqs), len(resps))
        self.assertGreater(len(reqs), 0)
        for r in resps:
            self.assertEqual(r["mode"], "recorded-replay")
        greqs = payloads(cell, "extractor.backend.grimp.req")
        gresps = payloads(cell, "extractor.backend.grimp.resp")
        self.assertEqual(len(greqs), len(gresps))
        self.assertIn(["richpkg.core", "richpkg.helpers"],
                      gresps[0]["importPairs"])

    def test_moat_anchor_wires(self):
        # each design-stub dock consumes the T1 anchors as candidate seeds
        cell = run_lang("latex")
        cands = payloads(cell, "extractor.t2.latex.ref.candidate")
        self.assertTrue(any(c["targetLabel"] == "sec:missing" for c in cands))
        incl = payloads(cell, "extractor.t2.latex.include.candidate")
        self.assertEqual(incl[0]["targetFile"], "chapter2")
        cell = run_lang("typst")
        refs = payloads(cell, "extractor.t2.typst.ref.candidate")
        self.assertTrue(any(c["targetLabel"] == "sec-missing" for c in refs))
        imps = payloads(cell, "extractor.t2.typst.import.edge")
        self.assertEqual(imps[0]["dstModule"], "helpers.typ")
        # anchor-seeding is the G/placeholder path — tier pinned to G (the
        # stub now reports lean -> CT; the CT path is covered by
        # test_lean_ct_dock.py)
        from harness import force_tier_g
        cell = run_lang("lean", capability_fn=force_tier_g)
        imps = payloads(cell, "extractor.t2.lean.import.edge")
        self.assertEqual(imps[0]["dstModule"], "Mathlib.Data.Nat.Basic")
        consts = payloads(cell, "extractor.t2.lean.const.candidate")
        self.assertTrue(any(c["usedConstant"] == "Basic.double" for c in consts))

    def test_design_decisions_probed(self):
        cell = run_lang("typst")
        self.assertIn("typst eval",
                      one_payload(cell, "extractor.t2.typst.query.deprecated")["reason"])
        self.assertIn("tinymist.pinMain",
                      one_payload(cell, "extractor.t2.typst.pinmain.warning")["reason"])
        cell = run_lang("latex")
        self.assertEqual(one_payload(cell, "extractor.t2.latex.backend.select")["chosen"],
                         "LaTeXML")
        unused = payloads(cell, "extractor.t2.latex.unused.label")
        self.assertTrue(any(u["label"] == "thm:main" for u in unused),
                        "thm:main is defined but never referenced")
        # the #8840 blind spot fires on BOTH paths; pinned to G here to keep
        # the design-decision test driver-free (CT covered in test_lean_ct_dock)
        from harness import force_tier_g
        cell = run_lang("lean", capability_fn=force_tier_g)
        self.assertIn("#8840", one_payload(cell, "extractor.t2.lean.axiom.gap")["reason"])

    def test_honest_gaps_carried(self):
        cell = run_lang("typst")
        gaps = one_payload(cell, "extractor.gaps.honest")["gaps"]
        self.assertEqual(len(gaps), 7)
        self.assertTrue(any("uniform T2 index" in g for g in gaps))


if __name__ == "__main__":
    unittest.main()
