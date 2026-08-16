"""the report — ACCEPTANCE-REPORT.md + evidence/checks.json.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from .common import (ACCEPTANCE_DIR, BOUNDS_HIT, CHECKS, CLASSES_EXERCISED,
                     EVIDENCE_DIR, ids_by_name)
from .suites import RECORDED_SUITES


def write_report(args, moat, lean, ceiling, suite_results,
                 headless_tail: str) -> None:
    names = ids_by_name(moat["analysis"])
    n_pass = sum(1 for c in CHECKS if c["pass"] is True)
    n_fail = sum(1 for c in CHECKS if c["pass"] is False)
    n_skip = sum(1 for c in CHECKS if c["pass"] is None)
    lines = []
    w = lines.append
    w("# ACCEPTANCE REPORT — §7, the organism breathes")
    w("")
    w(f"Generated {datetime.now(timezone.utc).isoformat()} by "
      f"`python acceptance/run_demo.py"
      f"{' --skip-ui' if args.skip_ui else ''}"
      f"{' --suites' if args.suites else ''}` · "
      f"**{n_pass} PASS / {n_fail} FAIL / {n_skip} SKIP**")
    w("")
    w("Inputs: `acceptance/fixtures/moatpkg` (roots `['moatpkg.core']`, LIVE "
      "pyright, REAL V1-measured capability), "
      "`acceptance/fixtures/unused_hyp.lean` (CT verdict-arrival world: REAL "
      "kernel greens + the resolved proof_uses edge — LEAN-DOCK round) and "
      "`acceptance/fixtures/honest_ceiling.typ` (the SURVIVING all-unknown "
      "honest ceiling — typst, cell-2 typed refusal + recorded local-stub "
      "fallback). Outputs: `analysis-moat.json`, `analysis-lean.json`, "
      "`analysis-ceiling.json` (canonical bytes == hub GET /analysis), "
      "`TRACE-full.json` (incl. the §7(i) greenTrace), "
      "`evidence/headless.json`, `evidence/ui-{moat,lean,ceiling}.json` "
      "(+ `ui-spec-*.json` — the DEFAULT headless UI acceptance: DOM/a11y + "
      "spike-surface pins, ZERO pixel screenshots; `browser_shot.mjs` "
      "screenshots are a MANUAL tool only, outside this gate).")
    w("")
    w("## §7 checks")
    w("")
    w("| check | result | proof |")
    w("|---|---|---|")
    for c in CHECKS:
        r = "PASS" if c["pass"] is True else ("FAIL" if c["pass"] is False
                                              else "SKIP (logged)")
        w(f"| {c['name']} | **{r}** | {c['detail']} |")
    w("")
    w("## The byte-identical id traces (§7 f + §7 i)")
    w("")
    tf = ACCEPTANCE_DIR / "TRACE-full.json"
    if tf.is_file():
        t = json.loads(tf.read_text(encoding="utf-8"))
        w(f"`{t['nodeId']}` (**{t['name']}**), idSha256 `{t['idSha256']}` — "
          f"byteIdenticalEverywhere: **{t['byteIdenticalEverywhere']}** across "
          f"hops: {', '.join(k for k, v in t['hops'].items() if v)}. "
          "Full pin refs in `acceptance/TRACE-full.json`; the V4 seed node "
          "(`n_ccb26550281c06b8`, richpkg) is verified by "
          "`outerwall/test_outerwall.py::Test02Rich`.")
        gt = t.get("greenTrace")
        if gt:
            w("")
            w(f"**The GREEN trace (§7 i)**: `{gt['nodeId']}` "
              f"(**{gt['name']}**), idSha256 `{gt['idSha256']}` — "
              f"byteIdenticalEverywhere: **{gt['byteIdenticalEverywhere']}** "
              f"across hops: {', '.join(k for k, v in gt['hops'].items() if v)}. "
              "Green BECAUSE the kernel verified it — the fill.source run-sha "
              "resolves to the probed driver invocation, the model wall's "
              "greenGuard admitted it, the editor wall's guard passed at the "
              "MEASURED CT tier.")
    else:
        w("TRACE-full.json was not written (check f failed before assembly).")
    w("")
    w("## Bounds hit this run (logged, never silent)")
    w("")
    for b in BOUNDS_HIT:
        w(f"- {b}")
    w("- span-file remap (editor nodes keyed by the open doc's uri; ids + "
      "byte spans untouched — EditorPane's declared bound, reused verbatim "
      "in the headless suite and the squiggle check)")
    w("- stub floor tier G for the headless/browser editor when no measured "
      "capability stream is aggregated — no live diagnostics claimed; the "
      "squiggle check (g) is the MEASURED-tier path; the §7(i) lean editor "
      "mounts at the tier the analysis MEASURED (capability.lean."
      "measuredTierPin == CT, asserted before mounting — the green comes "
      "from the attested schema fill through cell 4's guard, never from "
      "the stub transport)")
    w("- system-pins stream/payload bounds + hub /pins tail bounds stand as "
      "shipped (logged via outerwall.bound.logged / "
      "hub.pins.history.truncated when hit)")
    w("")
    w("## Failure classes exercised this run")
    w("")
    for cls in CLASSES_EXERCISED:
        w(f"- `{cls}`")
    w("- build-failing classes (`outline-vocabulary-leak`, "
      "`outline-closure-disagreement`, `provenance-hole`) and the seam "
      "catalog's bus/LSP/serializer classes are exercised by their owning "
      "suites (outerwall 41, hub 44, app, ai — see roll-up).")
    w("")
    w("## Suite roll-up (the whole organism)")
    w("")
    if suite_results:
        w("Measured live THIS run (--suites):")
        w("")
        w("| suite | result | tail |")
        w("|---|---|---|")
        for s in suite_results:
            tail_last = s["tail"].splitlines()[-1] if s["tail"] else ""
            w(f"| {s['suite']} | {'OK' if s['ok'] else 'FAIL'} | "
              f"{tail_last[:100]} |")
        w("")
    w("Recorded end-state numbers (source cited; not re-measured here unless "
      "listed above):")
    w("")
    w("| component | suite count | source |")
    w("|---|---|---|")
    for name, count, src in RECORDED_SUITES:
        w(f"| {name} | {count} | {src} |")
    w("")
    w("## Honest-ceiling statement of the whole system")
    w("")
    w("- **Green ONLY from the real checker.** (Green-flow round — this "
      "statement REPLACED the former 'no green anywhere in this demo': the "
      "LEAN-DOCK round made genuine kernel greens exist.) Every green in "
      "this demo is a Lean-kernel verdict: origin `checked`, fill.source "
      "`lean-kernel:v4.31.0:kernelAccepted … run=<sha16>` with the run-sha "
      "resolving to the probed driver invocation; the model wall's ingest "
      "greenGuard, cell 3's schema (unbacked-green), and the editor wall's "
      "guard (green-may-never-be-faked) each REJECT a green without that "
      "evidence — exercised live by §7(j). The moat (python) analysis stays "
      "all-unknown (no verdict compiler for python is attached), and the "
      "DOWN-only gutter path still works: a real pyright error pushes a "
      "node red (§7 g / V2); absence of diagnostics is never a verdict.")
    w("- **Unknown never upgrades, through every membrane**: the typst "
      "ceiling input surfaces T1 nodes + leads only; unknown crosses "
      "analyze() → canonical bytes → hub → view paints (hatched grey, "
      "dashed leads) → AI (honest no-claim on roots-undeclared) without a "
      "single upgrade (§7 h). Lean GRADUATED from this story by earning "
      "CT (measured by cell 2, never asserted) — its greens travel the "
      "same hops byte-identically (§7 i).")
    w("- **Reachability claims are bounded**: unused/reachable come strictly "
      "from the model wall's crosschecked query over DECLARED roots; blind "
      "spots (dynamic import) and the decl-universe bound stay declared in "
      "gapAnalysis; leads are never followed.")
    w("- **Capability tiers are measured, never asserted** (python CT + lean "
      "CT via cell 2's live batteries; typst recorded local-stub fallback "
      "with the refusal pins carried), and keys never leave the ai-server "
      "process (FAKE transport in the demo path; three custody proofs in "
      "REPORT-P3-face).")
    w("- **Lean bounds ride the output, verbatim**: 9 driver limits "
      "(single-file scope included), the unused-hypotheses summary, and the "
      "TOOLCHAIN PIN DIVERGENCE — driver `leanprover/lean4:v4.31.0` vs "
      "cell-2 lean_repo `v4.32.0` — stay DECLARED on the lean honest "
      "ceiling (`toolchainPinDivergence`, probed every CT run), NOT "
      "unified; the unification recommendation (re-pin one side and "
      "RE-MEASURE, nothing assumed to transfer) stands — "
      "REPORT-LEANDOCK.md bound 1.")
    w("- Pyright/grimp structure extraction is only as complete as its "
      "static view — `soundnessNote` and `blindSpots` ride in every "
      "analysis verbatim from the cells.")
    w("")
    w("## Headless suite tail (for the record)")
    w("")
    w("```")
    w(headless_tail)
    w("```")
    (ACCEPTANCE_DIR / "ACCEPTANCE-REPORT.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8")
    # full check evidence persisted for auditability (never printed-only)
    (EVIDENCE_DIR / "checks.json").write_text(
        json.dumps({"checks": CHECKS, "boundsHit": BOUNDS_HIT,
                    "classesExercised": CLASSES_EXERCISED,
                    "suiteResults": suite_results}, indent=2, default=str),
        encoding="utf-8")
    print(f"report: {ACCEPTANCE_DIR / 'ACCEPTANCE-REPORT.md'}", flush=True)
