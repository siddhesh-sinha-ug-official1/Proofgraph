"""T1 gates: byte-exact roundtrip per language (the C1 fixpoint at T1),
ID stability across whitespace-only reformats, DIY-tag visibility, node kinds
per §5.5.  All assertions on probe output."""
import os
import shutil
import stat
import tempfile
import unittest
from pathlib import Path

from harness import FIXTURES, payloads, run_lang, run_skeleton

from extractor import schema
from extractor.pipeline import ExtractorCell, PipelineConfig
from extractor.t1 import engine

ALL_LANG_DIRS = ["python", "pyrich", "lean", "latex", "typst", "go", "c", "cpp"]


class TestRoundtrip(unittest.TestCase):
    def test_roundtrip_every_language(self):
        for sub in ALL_LANG_DIRS:
            cell = run_lang(sub)
            checks = payloads(cell, "extractor.t1.roundtrip.check")
            self.assertGreater(len(checks), 0, sub)
            for c in checks:
                self.assertTrue(c["reprintEqualsSource"],
                                f"{sub}/{c['path']}: parse lost structure "
                                f"(divergence at {c['firstDivergenceByte']})")

    def test_broken_source_probes_error_nodes_but_still_spans(self):
        pr = engine.parse("python", b"def broken(:\n    pass\n")
        self.assertTrue(pr.error_spans, "ERROR nodes must be surfaced as leads")
        self.assertTrue(pr.reprint_equals_source,
                        "tree-sitter is error-tolerant: the tree still spans the file")


def _copytree_writable(src: Path, dst: Path) -> None:
    """shutil.copytree PRESERVES the ReadOnly attribute — if an external
    backup/sync/AV tool has marked the fixture tree ReadOnly (observed on this
    machine), the temp copy inherits it and later rewrites fail with
    PermissionError.  Failure class: attribute propagation, guarded by
    explicitly clearing ReadOnly on every copied file.  (Post-review fix from
    the cell's final DONE state at A:\\23lean-push — the assembly copy was
    taken mid-build and predated it; ported during the schema swap.)"""
    shutil.copytree(src, dst)
    for p in dst.rglob("*"):
        if p.is_file():
            os.chmod(p, stat.S_IWRITE | stat.S_IREAD)


class TestIdStability(unittest.TestCase):
    def test_reformat_and_body_edits_keep_ids(self):
        # Assembly ruling 5 (canonical mint): the id preimage is the STRUCTURAL
        # locator (lang, kind, canonicalName, file, path), NOT span text — so
        # ids survive whitespace reformats AND body edits.  This supersedes the
        # cell's old span-text content-addressing, under which a body change
        # minted a new id.
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "python"
            _copytree_writable(FIXTURES / "python", root)
            cfg = dict(roots=["pkg.a"], python_package="pkg", pyright_mode="none")
            cell1 = ExtractorCell(PipelineConfig(**cfg))
            cell1.run(root)
            ids1 = {n["name"]: n["id"] for n in cell1.dump()["nodes"]}
            # whitespace-only reformat: CRLF line endings, trailing spaces, blank lines
            b = root / "pkg" / "b.py"
            b.write_bytes(b'NAME = "b"   \r\n\r\n\r\n')
            cell2 = ExtractorCell(PipelineConfig(**cfg))
            cell2.run(root)
            ids2 = {n["name"]: n["id"] for n in cell2.dump()["nodes"]}
            self.assertEqual(ids1["pkg.b"], ids2["pkg.b"],
                             "whitespace-only reformat must keep the id")
            # a body edit ALSO keeps the id (ruling 5: identity is structural)
            b.write_bytes(b'NAME = "changed"\n')
            cell3 = ExtractorCell(PipelineConfig(**cfg))
            cell3.run(root)
            ids3 = {n["name"]: n["id"] for n in cell3.dump()["nodes"]}
            self.assertEqual(ids1["pkg.b"], ids3["pkg.b"],
                             "ids are content-INsensitive to body edits (ruling 5)")

    def test_node_id_preimage_probed(self):
        cell = run_skeleton()
        for p in payloads(cell, "extractor.t1.node.id"):
            self.assertIn("preimage", p)
            self.assertIn("canonicalName", p["preimage"])
            # canonical mint: the structural locator {file, path} is the
            # normalized span — both must be visible in the probed preimage
            self.assertIn("file", p["preimage"])
            self.assertIn("path", p["preimage"])

    def test_structural_identity_function(self):
        # Canonical mint semantics (assembly ruling 5): identity is a pure
        # function of (lang, kind, module, rawName, file) — there is no span
        # text input at all, so body content cannot influence the id.
        a = schema.compute_node_identity("python", "function", "m", "f", "m.py")
        b = schema.compute_node_identity("python", "function", "m", "f", "m.py")
        self.assertEqual(a["nodeId"], b["nodeId"])
        self.assertEqual(a["canonicalName"], "m.f")
        self.assertEqual(a["path"], "m::f")
        # a structural MOVE (different file) is a different identity
        c = schema.compute_node_identity("python", "function", "m", "f", "other/m.py")
        self.assertNotEqual(a["nodeId"], c["nodeId"])
        # and a rename is a different identity
        d = schema.compute_node_identity("python", "function", "m", "g", "m.py")
        self.assertNotEqual(a["nodeId"], d["nodeId"])


class TestT1Structure(unittest.TestCase):
    def test_diy_tags_flagged_for_moat_langs(self):
        for sub in ("lean", "latex", "typst"):
            cell = run_lang(sub)
            src = payloads(cell, "extractor.t1.tagsscm.source")
            self.assertEqual(src[0]["tagsScm"], "DIY", sub)
            warn = payloads(cell, "extractor.t1.tagsscm.diy.warning")
            self.assertTrue(warn and warn[0]["captures"], sub)
            for p in payloads(cell, f"extractor.t1.node.{sub}"):
                self.assertTrue(p.get("diyTag"), f"{sub} node not flagged diyTag")

    def test_first_party_tags_for_code_langs(self):
        for sub in ("python", "go", "c", "cpp"):
            cell = run_lang(sub)
            src = payloads(cell, "extractor.t1.tagsscm.source")
            self.assertEqual(src[0]["tagsScm"], "first-party", sub)

    def test_node_kinds_match_spec_table(self):
        expected = {
            "lean": {("module", "Basic"), ("decl", "Basic.double"),
                     ("theorem", "Basic.double_eq"), ("section", "Basic.Helpers"),
                     ("theorem", "Basic.triv"), ("decl", "Basic.Point")},
            "latex": {("section", "main:Intro"), ("section", "chapter2:More"),
                      ("label", "sec:intro"), ("label", "sec:more"),
                      ("label", "thm:main"), ("label", "fig:one"),
                      ("theorem", "main:newtheorem:thm"), ("theorem", "main:thm:main"),
                      ("figure", "main:fig:one")},
            "typst": {("section", "main:Introduction"), ("section", "helpers:Helpers"),
                      ("label", "sec-intro"), ("label", "sec-helpers"),
                      ("label", "fig-one"), ("decl", "main.double"),
                      ("decl", "helpers.util"), ("figure", "main:fig-one")},
            "go": {("module", "main"), ("decl", "main.Greeter"),
                   ("function", "main.hello"), ("function", "main.main")},
            "c": {("class", "Point"), ("decl", "counter"),
                  ("function", "add"), ("function", "main")},
            "cpp": {("decl", "demo"), ("class", "Vec"), ("class", "Widget"),
                    ("function", "Widget::size"), ("function", "main")},
        }
        for sub, want in expected.items():
            cell = run_lang(sub)
            got = {(n["kind"], n["name"]) for n in cell.dump()["nodes"]}
            self.assertEqual(got, want, sub)

    def test_anchors_recorded_as_t2_seeds(self):
        want = {
            "lean": {("import", "Mathlib.Data.Nat.Basic")},
            "latex": {("labelref", "sec:intro"), ("labelref", "sec:missing"),
                      ("labelref", "fig:one"), ("cite", "knuth84"),
                      ("cite", "lamport94"), ("include", "chapter2")},
            "typst": {("ref", "sec-intro"), ("ref", "fig-one"),
                      ("ref", "sec-missing"), ("import", "helpers.typ")},
        }
        for sub, expected_subset in want.items():
            cell = run_lang(sub)
            got = {(p["anchorKind"], p["targetText"])
                   for p in payloads(cell, "extractor.t1.anchor.emit")}
            self.assertTrue(expected_subset <= got,
                            f"{sub}: missing anchors {expected_subset - got}")

    def test_nested_defs_rejected_with_reason(self):
        cell = run_lang("pyrich", python_package="richpkg")
        rejects = payloads(cell, "extractor.t1.node.reject")
        self.assertTrue(any("nested below top-level" in r["reason"] for r in rejects),
                        "methods inside classes must be probed as rejects")


if __name__ == "__main__":
    unittest.main()
