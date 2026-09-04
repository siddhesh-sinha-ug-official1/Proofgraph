"""Gate 16 — the REAL python profile (Phase-2 V1 cell change request).

The 'python' profile wires the real pyright-langserver (spawned exactly as the
assembly mandates: `cmd /c npx --yes -p pyright pyright-langserver --stdio`)
and lets the cell's OWN P0-P11 battery MEASURE it live against the repo at
testbed/python_repo.  Nothing in the profile asserts a tier — the assertions
below pin what the battery MEASURED on this machine (observed live,
2026-07-20: **CT**, earned by a genuine P2 pass — pyright returned a new
severity-1 diagnostic for the injected `result = "str" + 1`), together with
the P2 evidence, so the tier can never drift from its proof.

Measured consequences of the ybg-flavored probes, DOCUMENTED not hidden:
  * P6 (completion after `import lib` / `lib.`): pyright answers with real
    completion items but populates `detail` lazily via completionItem/resolve,
    which the battery does not send — P6 therefore measures **fail** ("no
    typed members returned").  The library-surfacing verdict is honestly
    reduced; it does not gate the depth tier (only P2 does).
  * library inventory (stage H): the on-demand source records the same
    detail-less items; the non-uniformity lead lists the sources used.
  * P3 skips (python has no `let`), P8 skips (no gen file in the repo).

One live run is shared by every test in this gate (module cache) — the run is
expensive (two real npx spawns: cold start + the P11 restart).

LOUD skip if npx is unavailable (mirrors cell 3's live-pyright oracle gate).
"""

import os
import shutil
import subprocess
import sys
import time
import unittest
from pathlib import Path

import capability.capability               # noqa: F401  (ensure submodule)
from capability import probes
from capability.schema import green_allowed

cap_mod = sys.modules["capability.capability"]

_WALL_PATH = Path(__file__).resolve().parents[2] / "wall.py"


def _load_wall() -> dict:
    ns = {"__name__": "capability_layer_wall", "__file__": str(_WALL_PATH)}
    source = _WALL_PATH.read_text(encoding="utf-8")
    exec(compile(source, str(_WALL_PATH), "exec"), ns)
    return ns


def _node_pids() -> set[str]:
    """PIDs of node processes — the orphan sweep baseline.
    On Windows, tasklist.  On POSIX, pgrep."""
    if os.name == "nt":
        cp = subprocess.run(["tasklist", "/FI", "IMAGENAME eq node.exe", "/FO", "CSV"],
                            capture_output=True, text=True)
        pids = set()
        for line in (cp.stdout or "").splitlines():
            parts = [p.strip('"') for p in line.split('","')]
            if len(parts) >= 2 and parts[0].lower() == "node.exe":
                pids.add(parts[1])
        return pids
    else:
        try:
            cp = subprocess.run(["pgrep", "-x", "node"],
                                capture_output=True, text=True)
            return set((cp.stdout or "").split())
        except FileNotFoundError:
            return set()


_STATE: dict = {}


def get_python_wall():
    """One shared live run: capability_wall('python') over the real pyright."""
    if "error" in _STATE:
        raise _STATE["error"]
    if "wall" not in _STATE:
        if shutil.which("npx") is None:
            raise unittest.SkipTest(
                "LOUD SKIP: npx unavailable — the live python battery was NOT "
                "measured (the ybg fixture gates still run)")
        _STATE["node_pids_before"] = _node_pids()
        WALL = _load_wall()
        _STATE["WALL"] = WALL
        wall = WALL["capability_wall"]("python")
        _STATE["wall"] = wall
        # snapshot the pins for THIS run immediately (dump/history are
        # module-global last-run state)
        _STATE["hist"] = wall.pins.history()
        _STATE["dump"] = wall.pins.dump()
    return _STATE["wall"]


def _events(hist, probe_id):
    return [e for e in hist if e["probeId"] == probe_id]


class TestPythonProfileLive(unittest.TestCase):
    def test_a_real_pyright_server_wired(self):
        get_python_wall()
        spawns = _events(_STATE["hist"], "capability.wire.spawn")
        self.assertTrue(spawns, "no server spawn lead — pyright never wired")
        argv = spawns[0]["payload"]["argv"]
        self.assertIn("pyright-langserver", argv)
        self.assertIn("--stdio", argv)
        # P0 read back a real capability map
        p0 = _events(_STATE["hist"], "capability.probe.p0")[-1]["payload"]
        self.assertEqual(p0["verdict"], "pass")
        self.assertIn("completionProvider", p0["response"])

    def test_b_measured_tier_is_the_pin_truth(self):
        wall = get_python_wall()
        measured = _events(_STATE["hist"], "capability.probe.measuredTier")
        self.assertEqual(len(measured), 1)
        pin_tier = measured[0]["payload"]["measuredTier"]
        # face == pin, byte-equal
        self.assertEqual(wall.tier, pin_tier)
        self.assertEqual(wall.tier.encode("utf-8"), pin_tier.encode("utf-8"))
        # the MEASURED result on this machine, pinned WITH its proof: CT was
        # earned by a genuine P2 pass (see test_c) — never asserted a priori.
        self.assertEqual(pin_tier, "CT",
                         "pyright's measured tier changed — re-read the P2 "
                         "evidence before touching this pin")
        faked = _events(_STATE["hist"], "capability.probe.faked")[-1]["payload"]
        self.assertEqual(faked["greenAllowed"],
                         green_allowed(wall.tier, wall.probeReport["p2"]))
        # ruling 2: resolved rights come from the measured tier
        self.assertEqual(wall.provenance["resolved"], wall.tier == "CT")

    def test_c_p2_is_a_real_python_type_error(self):
        wall = get_python_wall()
        p2 = _events(_STATE["hist"], "capability.probe.p2")[-1]["payload"]
        self.assertTrue(p2["ran"])
        self.assertIn('result = "str" + 1', p2["request"]["injected"],
                      "the generic injection must be the real python type error")
        self.assertEqual(p2["verdict"], "pass",
                         "pyright stopped flagging the injected type error")
        errors = [d for d in p2["response"] if d.get("severity") == 1]
        self.assertTrue(errors, "no severity-1 diagnostic came back")
        verdicts = _events(_STATE["hist"], "capability.probe.p2.verdict")
        self.assertEqual(verdicts[-1]["payload"]["p2"], "pass")

    def test_d_probe_consequences_documented_not_hidden(self):
        get_python_wall()
        by_id = {r["id"]: r for r in _STATE["dump"]["battery"]["results"]}
        # P6: measured consequence of the detail-less completion items (pyright
        # resolves `detail` lazily) — an honest FAIL, logged here as the
        # documented consequence, never silently upgraded.
        self.assertEqual(by_id["P6"]["verdict"], "fail")
        self.assertIn("no typed members", by_id["P6"]["evidence"])
        # P3/P8 skip for structural reasons (no `let`, no gen file)
        self.assertEqual(by_id["P3"]["verdict"], "skip")
        self.assertEqual(by_id["P8"]["verdict"], "skip")
        # stage H recorded its sources + the non-uniformity cap
        nonuni = _events(_STATE["hist"], "capability.lib.nonuniform")
        self.assertEqual(len(nonuni), 1)
        self.assertIn("ondemand-completion", nonuni[0]["payload"]["sources"])
        # the on-demand inventory DID come back with real items (pyright
        # completions for `lib.`) — reduced detail, not absence
        ondemand = _STATE["dump"]["libInventory"]["ondemand"]
        self.assertTrue(ondemand, "pyright returned no completion items at all")
        labels = {i.get("label") for i in ondemand}
        self.assertIn("parse", labels)

    def test_e_no_grammar_floor_bound_is_visible(self):
        # the stub tree-sitter runtime has no .py grammar: python has NO G
        # fallback this round.  That bound must be visible, not silent: the
        # discovery grammar lead says so verbatim.
        get_python_wall()
        grammar = _events(_STATE["hist"], "capability.discovery.grammar")
        self.assertEqual(len(grammar), 1)
        self.assertIn("NOT wired", grammar[0]["payload"]["source"])
        floor_leads = _events(_STATE["hist"], "capability.floor.parse")
        self.assertEqual(floor_leads, [], "no stub grammar should have parsed .py")

    def test_z_shutdown_kills_the_whole_npx_tree(self):
        wall = get_python_wall()
        shutdown_seen = []
        untap = probes.tap("capability.wall.shutdown", shutdown_seen.append)
        try:
            wall.shutdown()
        finally:
            untap()
        self.assertEqual(len(shutdown_seen), 1)
        self.assertTrue(shutdown_seen[0]["payload"]["terminated"])
        client = wall.handle._client
        self.assertIsNotNone(client.proc.poll(), "cmd/npx wrapper still alive")
        # orphaned-subprocess-tree guard: every node process spawned by this
        # run must be gone.  On Windows, killing only the cmd wrapper orphans
        # node; on POSIX, killing only the npx parent orphans the node child.
        before = _STATE["node_pids_before"]
        deadline = time.time() + 20
        leaked = _node_pids() - before
        while leaked and time.time() < deadline:
            time.sleep(1)
            leaked = _node_pids() - before
        self.assertEqual(leaked, set(),
                         f"orphaned node processes: {leaked}")


if __name__ == "__main__":
    unittest.main()
