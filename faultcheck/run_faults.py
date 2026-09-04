"""FAULT-INJECTION suite — remediation worklist item 4.1 (assembly-level).

    python faultcheck/run_faults.py            (from proofgraph/ or anywhere)

Proves that each core guard CATCHES its defect — never by reimplementing the
check, always by injecting ONE deliberate defect into a SCRATCH COPY of the
tree (tempdir; the working tree is NEVER touched) and running the EXISTING
suite/gate against it, asserting that the suite REPORTS FAILURE with the
guard's own named class.  Method per fault (the honesty protocol):

  1. fresh scratch copy of the whole proofgraph tree (shutil.copytree; node_modules
     junctioned read-only where a JS suite needs them; __pycache__/.git/
     app-dist excluded — regenerated state, never inputs);
  2. CONTROL: the exact suite command runs CLEAN in the scratch copy and must
     PASS — proving a later failure is the DEFECT's doing, not the copy's;
  3. ONE deliberate defect is injected (anchored text patch; the harness
     refuses to run if the anchor is missing or ambiguous — no silent no-op);
  4. the SAME suite command re-runs and must FAIL (nonzero exit) AND its
     output must carry the guard's named failure class (signature match);
  5. the scratch copy is discarded (junctions unlinked FIRST, then rmtree —
     the originals are structurally unreachable).

The guarantees and their guards (a–e = worklist item 4.1's five core
guards; f = the wave-3 line-gate, additive):

  a. verdict-integrity   green minted without checker evidence in the lean
                         dock -> cell 3's assemble green-audit / SchemaNode.
                         validate raises the named class `unbacked-green`
                         (suite: python selftest/run_all.py --fast).
  b. Py<->TS ID consistency  one byte of one node id flipped in the SERVED
                         /graph payload (after the hub's own verify — a
                         tampering-serializer stand-in) -> the V4 connector
                         test's three-way equality gate (app/src/
                         graphSource.ts fetchGraphVerified) fails with
                         `serializer-edge-drop` (suite: vitest V4).
  c. leads/edges separation  the pipeline envelope partition regresses so
                         unresolved rows ride edges[] -> the wall/ingest
                         gates (`lead-in-edges` / validate.py's
                         "resolved=false is a lead") fail (suite: V3).
  d. provenance completeness  the outer wall's provenance builder stops
                         recording the `tier` field -> assert_no_holes
                         raises the BUILD-FAILING class `provenance-hole`
                         (suite: python outerwall/test_outerwall.py).
  e. bundle credential check  key material planted in app source ->
                         the P3 build gate's dist byte-scan fails
                         ("key-shaped material reached the browser bundle")
                         (suite: vitest test/p3.build.gate.test.ts).
  f. line-gate ceiling   a 250-line non-exempt source file planted in the
                         tree -> linegate.py exits 1 naming it with the class
                         `line-gate-violation` (suite: python linegate.py).
                         Added wave-3 with the line-gate; additive to the
                         a-e core-guard set.

Exit 0 iff EVERY fault: control PASSED, fault run FAILED, signature found.

SUB200 restructure (wave 2): this file is the ONE-COMMAND FACADE — same
CLI, same filter args, same output format; the harness lives in
faultcheck/faultlib/harness.py and the fault catalog in
faultcheck/faultlib/catalog.py (carved verbatim).
"""
from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

from faultlib.harness import (PROOFGRAPH, copy_tree, discard, excerpt,
                              make_junction, run_cmd)
from faultlib.catalog import FAULTS


def run_fault(spec: dict) -> dict:
    key = spec["key"]
    print(f"\n=== FAULT {key} ===")
    print(f"    guarantee: {spec['guarantee']}")
    print(f"    defect:    {spec['defect']}")
    scratch = Path(tempfile.mkdtemp(prefix=f"pg-fault-{key[:1]}-"))
    root = scratch / "proofgraph"
    junctions: list[Path] = []
    t0 = time.monotonic()
    try:
        print(f"    scratch:   {root}")
        copy_tree(root)
        for rel in spec["junctions"]:
            link = root / rel
            make_junction(link, PROOFGRAPH / rel)
            junctions.append(link)
        print(f"    copy+junctions: {time.monotonic() - t0:.1f}s")

        cmd, cwd = spec["cmd"], root / spec["cwd"]
        shown = " ".join(cmd[2:] if cmd[:2] == ["cmd", "/c"] else cmd)
        print(f"    suite:     {shown}   (cwd {spec['cwd']})")

        t1 = time.monotonic()
        rc_ctl, out_ctl = run_cmd(cmd, cwd, spec["timeout"])
        ctl_ok = rc_ctl == 0
        print(f"    CONTROL (clean copy): rc={rc_ctl} "
              f"{'PASS' if ctl_ok else 'FAIL — scratch env broken, fault run void'} "
              f"({time.monotonic() - t1:.1f}s)")
        for ln in excerpt(out_ctl, [], 2):
            print(f"        | {ln}")

        caught, rc_flt, ev = False, None, []
        if ctl_ok:
            spec["inject"](root)
            t2 = time.monotonic()
            rc_flt, out_flt = run_cmd(cmd, cwd, spec["timeout"])
            ev = excerpt(out_flt, spec["signatures"])
            sig_hit = any(s in out_flt for s in spec["signatures"])
            caught = (rc_flt != 0) and sig_hit
            print(f"    FAULT RUN: rc={rc_flt} "
                  f"suiteFailed={rc_flt != 0} signatureFound={sig_hit} "
                  f"({time.monotonic() - t2:.1f}s)")
            for ln in ev:
                print(f"        | {ln}")
    except Exception as exc:
        print(f"    ERROR: {exc}")
        return {"key": key, "controlPassed": False, "faultRc": None,
                "caught": False, "evidence": [str(exc)],
                "wall_s": round(time.monotonic() - t0, 1)}
    finally:
        fate = discard(scratch, junctions)
        print(f"    scratch: {fate}")
    return {"key": key, "controlPassed": ctl_ok, "faultRc": rc_flt,
            "caught": caught, "evidence": ev,
            "wall_s": round(time.monotonic() - t0, 1)}


def main() -> int:
    print("FAULT-INJECTION SUITE — 5 core guards + line-gate, scratch copies, "
          "real suites")
    print(f"tree: {PROOFGRAPH}")
    # optional dev filter: `run_faults.py a c` runs only faults a-* and c-*.
    picks = [a for a in sys.argv[1:]]
    faults = [s for s in FAULTS
              if not picks or any(s["key"].startswith(p) for p in picks)]
    if picks:
        print(f"[filter] running {len(faults)}/{len(FAULTS)} faults: "
              f"{[s['key'] for s in faults]} — the FULL run is the record")
    results = [run_fault(s) for s in faults]
    print("\n" + "=" * 76)
    print(f"{'fault':<28} {'control':<8} {'suite failed':<13} "
          f"{'guard caught':<13} {'time':>6}")
    print("-" * 76)
    ok = True
    for r in results:
        ok = ok and r["caught"]
        print(f"{r['key']:<28} {'PASS' if r['controlPassed'] else 'FAIL':<8} "
              f"{str(r['faultRc'] not in (0, None)):<13} "
              f"{'CAUGHT' if r['caught'] else 'MISSED':<13} {r['wall_s']:>5.0f}s")
    print("-" * 76)
    print(f"faults caught: {sum(r['caught'] for r in results)}/{len(results)}"
          f"  ->  {'OK' if ok else 'FAILED'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
