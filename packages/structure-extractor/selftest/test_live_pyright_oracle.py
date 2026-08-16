"""Compiler-as-oracle cross-check (§9): re-run the rich fixture against LIVE
pyright and diff the resolved edge set against the recorded-replay run.  If
live pyright is unavailable the skip is LOUD (printed), never silent — but
when it runs, any mismatch fails."""
import shutil
import unittest

from harness import FIXTURES, RICH_ROOTS, edge_view, run_rich

from extractor.pipeline import ExtractorCell, PipelineConfig


def _skip_without_npx(test: unittest.TestCase) -> None:
    if shutil.which("npx") is None:
        test.skipTest("LOUD SKIP: npx unavailable — live pyright oracle not run "
                      "(recorded-replay tests still gate the merge)")


class TestLivePyrightOracle(unittest.TestCase):
    def test_live_matches_recording(self):
        _skip_without_npx(self)
        recorded = edge_view(run_rich())
        live = edge_view(run_rich(pyright_mode="live"))
        self.assertEqual(live, recorded,
                         "live pyright disagrees with the recording — re-record "
                         "(selftest/tools/record_pyright.py) and review the diff")

    def test_bare_package_dir_resolves_live(self):
        """Remediation round — the package-root-uri-mismatch PROPER FIX
        (previously a logged assembly bound worked around by outer-wall
        staging).  Extracting a BARE package dir (ingest root == the package
        itself) detects the package PARENT as project root; before the fix
        the LSP wire uris were minted by joining the dock's ingest-relative
        rel onto that parent, so every live definition lookup returned [] and
        calls degraded to leads — that's the bug's signature.  This test
        extracts fixtures/pyrich/richpkg DIRECTLY with pyright LIVE and
        asserts resolved calls edges exist and the whole relation set equals
        the parent-root recorded run (module names are project-root-relative,
        so the name-keyed edge view is comparable 1:1)."""
        _skip_without_npx(self)
        bare_root = FIXTURES / "pyrich" / "richpkg"
        cfg = PipelineConfig(roots=list(RICH_ROOTS), python_package="richpkg",
                             pyright_mode="live")
        cell = ExtractorCell(cfg)
        cell.run(bare_root)

        # the mismatch case really was exercised: project root detected as the
        # package PARENT while the ingest root is the bare package dir
        detects = [e.payload for e in cell.bus.events(
            probeId="extractor.ingest.projectroot.detect")
            if e.payload.get("lang") == "python"]
        self.assertEqual(len(detects), 1)
        self.assertEqual(detects[0]["root"], str(bare_root.parent))
        self.assertEqual(detects[0]["anchor"], "package")

        # span.file stays INGEST-root-relative (no 'richpkg/' prefix) — ids
        # are minted from this structural locator; only LSP wire paths changed
        state = cell.dump()
        span_files = {n["span"]["file"] for n in state["nodes"]}
        self.assertTrue(span_files)
        for f in span_files:
            self.assertFalse(f.startswith("richpkg/"),
                             f"span.file {f!r} is not ingest-root-relative")

        # the bug's signature inverted: live pyright resolves calls edges
        resolved_calls = [e for e in state["edges"]
                          if e["kind"] == "calls" and e["resolved"]
                          and e["resolver"] == "pyright"]
        self.assertTrue(resolved_calls,
                        "no resolved calls edges from a bare-package-dir live "
                        "extract — the package-root-uri-mismatch signature")

        # full relation parity with the parent-root recorded run
        self.assertEqual(edge_view(cell), edge_view(run_rich()),
                         "bare-dir live extract disagrees with the parent-root "
                         "recorded run at the relation level")


if __name__ == "__main__":
    unittest.main()
