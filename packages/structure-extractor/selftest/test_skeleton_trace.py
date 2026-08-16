"""Walking-skeleton acceptance (§8): the exact expected probe trace, asserted
in order, with `unusedSet == [pkg.c]` as the result.  Every line of the spec's
trace is one assertion here."""
import unittest

from harness import assert_trace, run_skeleton


class TestWalkingSkeletonTrace(unittest.TestCase):
    def test_expected_trace_in_order(self):
        cell = run_skeleton()
        h = cell.history(strip_wall=True)
        assert_trace(h, [
            ("extractor.boundary.import.check",
             lambda p: p["allowed"] is True, "gate wired first"),
            ("extractor.ingest.file", lambda p: p["path"] == "pkg/a.py", "a.py"),
            ("extractor.ingest.file", lambda p: p["path"] == "pkg/b.py", "b.py"),
            ("extractor.ingest.file", lambda p: p["path"] == "pkg/c.py", "c.py"),
            ("extractor.ingest.capability.response",
             lambda p: p["lang"] == "python" and p["tier"] == "CT", "tier=CT"),
            ("extractor.ingest.dock.selected",
             lambda p: p["dock"] == "python", "dock=python"),
            ("extractor.t1.parse.grammar",
             lambda p: "python" in p["grammar"], "tree-sitter-python"),
            ("extractor.t1.node.python",
             lambda p: p["name"] == "pkg.a" and p["kind"] == "module", "module a"),
            ("extractor.t1.node.python",
             lambda p: p["name"] == "pkg.b" and p["kind"] == "module", "module b"),
            ("extractor.t1.node.python",
             lambda p: p["name"] == "pkg.c" and p["kind"] == "module", "module c"),
            ("extractor.t1.roundtrip.check",
             lambda p: p["reprintEqualsSource"] is True, "roundtrip"),
            ("extractor.t2.py.grimp.build",
             lambda p: p["package"] == "pkg", "grimp build"),
            ("extractor.t2.py.grimp.import.candidate",
             lambda p: p["srcModule"] == "pkg.a" and p["dstModule"] == "pkg.b", "a->b"),
            ("extractor.t2.py.call.resolve.decision",
             lambda p: p["outcome"] == "resolved" and p["resolver"] == "grimp"
             and p["reason"].startswith("bound via real import graph"), "resolved"),
            ("extractor.t2.py.scip.fallback",
             lambda p: p["chosen"] == "pyright-direct", "D2"),
            ("extractor.t2.py.honest_ceiling",
             lambda p: any("imports" in r for r in p["resolves"])
             and any("dynamic dispatch" in c for c in p["cannotResolve"]), "ceiling"),
            ("extractor.assemble.graph.emit",
             lambda p: p == {"nodeCount": 3, "edgeCount": 1, "resolvedEdges": 1,
                             "unresolvedLeads": 0}, "graph emit 3/1/1/0"),
            ("extractor.t3.graph.exclude.unresolved",
             lambda p: p["excludedCount"] == 0, "no leads excluded"),
            ("extractor.t3.reach.descendants",
             lambda p: p["roots"] == ["pkg.a"]
             and p["reachableSet"] == ["pkg.a", "pkg.b"], "reach a,b"),
            ("extractor.t3.unused.complement",
             lambda p: p["unusedSet"] == ["pkg.c"], "THE result"),
            ("extractor.t3.condensation.dag",
             lambda p: p["condensationIsDag"] is True, "condensation DAG"),
            ("extractor.t3.networkx.crosscheck",
             lambda p: p["lib"] == "networkx", "crosscheck"),
            ("extractor.t3.agreement.diff",
             lambda p: p["agree"] is True
             and p["diff"] == {"onlyInRustworkx": [], "onlyInNetworkx": []}, "agree"),
            ("extractor.t3.soundness.blindspots",
             lambda p: "dynamic dispatch" in p["missingEdgeClasses"], "blind spots"),
            ("extractor.output.honest_ceiling.report", None, "ceiling report"),
        ])

    def test_result_values(self):
        cell = run_skeleton()
        state = cell.dump()
        self.assertEqual(state["t3"]["unusedSet"], ["pkg.c"])
        self.assertEqual(len(state["edges"]), 1)
        e = state["edges"][0]
        self.assertEqual((e["kind"], e["resolved"], e["resolver"],
                          e["provenance"]["tier"], e["provenance"]["extractor"]),
                         ("imports", True, "grimp", "T2", "grimp"))


if __name__ == "__main__":
    unittest.main()
