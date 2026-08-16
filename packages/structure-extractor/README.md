# Tree 3 — Structure & Relationship Extractor (ProofGraph cell)

Source (code **and** documents) → schema-conformant graph:
**T1** structure nodes uniformly via tree-sitter (all 7 languages) ·
**T2** resolved relationship edges via per-language **docks** ·
**T3** graph properties uniformly via rustworkx (NetworkX cross-check).
Every node, candidate edge, resolver decision, and rejected edge is a probe
lead. **Maximally probe-able; the Phase-1 membrane (`wall.py`, MEMBRANE-SPEC.md)
is promoted OVER the pins — it never replaces them.**

## Quick start

```bash
python run_skeleton.py           # walking skeleton: a→b resolved, c unused
python selftest/run_all.py       # the full gate suite (140 tests, probe-asserting;
                                 # live pyright + live lean CT driver included)
python selftest/run_all.py --fast   # skip the live-pyright oracle
```

## Entry points (Probe Density Contract §3–4)

```python
from extractor.pipeline import ExtractorCell, PipelineConfig
cell = ExtractorCell(PipelineConfig(roots=["pkg.a"], python_package="pkg"))
result = cell.run(Path("fixtures/python"))   # {nodes, edges, t3, honestCeilings, summary}

cell.probeCatalog()   # every available lead: {probeId, kind, payloadType, description}
cell.dump()           # the ENTIRE internal state (nodes, candidates, decisions, edges, T3, ceilings)
cell.tap(pid, fn)     # subscribe to one live lead
cell.history()        # ordered probe stream; deterministic by logicalClock (wallNanos never orders)
```

## Layout

```
extractor/
  boundary.py        import-boundary gate (wired first) + SPDX license posture
  probe/             ProbeBus + the full §6 catalog (149 leads, additive-only)
  schema.py          Frozen Schema v0 (verified-in-sync mirror of packages/schema,
                     membrane test asserts value-equality + PIN): kinds, content-addressed
                     IDs, placeholders
  capability.py      Tree 2 stub: capability(lang) → {tier CT/S/G/P, handle}  ← the seam
  ingest.py          S0: lang detect, project-root anchors, SourceSets
  t1/                S1: tree-sitter engine + tags/ (DIY .scm for lean/latex/typst)
  docks/             S2: Dock contract; python (SHIP: grimp+Pyright);
                     lean (CT kernel-driver path wired, LEAN-DOCK round; G placeholder
                     preserved); latex / typst (DESIGN/STUB with §5.9 pipelines + ceilings)
  assemble.py        S3: normalize→SchemaEdge, dedup, provenance audit, faked-edge & tier guards
  t3.py              S4: lead exclusion → Tarjan/Johnson(bounded)/reachability;
                     unused (unreachable) vs unreferenced (in-degree 0) kept distinct
  pipeline.py        S5 output + the ExtractorCell façade
wall.py              Phase-1 membrane face (extract_wall; MEMBRANE-SPEC.md is the contract)
fixtures/            7-language fixtures + golden files (hand-reviewed) + pyright recording
selftest/            §9 gates — every test asserts on PROBE OUTPUT
agentic-convos/      this tree's build transcript
```

## Honesty model (the part that must never regress)

- `resolved=true` is minted only through `decide_resolved` — one call site per
  resolution path (grimp imports; Pyright calls/inherits; lean-driver
  proof_uses/imports) — and **only** with binding evidence (grimp's real import
  graph; a Pyright definition location; the driver's elaborated refs/header). Every
  candidate yields exactly one `ResolverDecision` with a taxonomy `reason`.
- `resolved=false` is a **lead**: dst is an `unresolved:` placeholder, excluded
  from T3 (`extractor.t3.graph.exclude.unresolved`), never presented as a relationship.
- Tree 2's tier caps every dock (`CT/S/G/P`); at `G` the assemble stage raises
  `TierInflationError` on any resolved claim. Stub docks run at `G` → leads only.
- `fill` stays `unknown` for every language EXCEPT lean at a CT capability
  response (LEAN-DOCK round): the kernel driver mints green ONLY with origin
  `checked` + a `lean-kernel:` attestation (sorry → amber, elaboration error →
  red, unjudged → unknown — never green from absence); any other green is the
  failure class `unbacked-green` (schema + assemble + tier guards).
  `outline` is always `null` (gap-analysis round owns it).
- Unused results always ship beside `extractor.t3.soundness.blindspots`
  (dynamic dispatch / reflection / DI / dynamic imports). The `richpkg.plugin`
  fixture demonstrates the blind spot on purpose.

## License posture

Embedded (permissive): tree-sitter + language pack (MIT), grimp (BSD-2),
rustworkx (Apache-2.0), networkx (BSD-3). Subprocess-only: pyright (MIT npm CLI,
by design), the lean kernel driver (`lean --run Driver.lean`, toolchain
Apache-2.0, live since the LEAN-DOCK round), and when the remaining moat docks
go live: LaTeXML (CC0), typst (Apache-2.0), lake (Apache-2.0), texlab
(**GPL-3.0 — never linked**). The boundary gate fails the build if any
subprocess-only tool is ever imported.

## Status

Walking skeleton + Python dock shipped end-to-end; the Lean dock's CT
kernel-driver path is wired (LEAN-DOCK round: real kernel verdicts, resolved
proof_uses/imports, unbacked-green guard; the G placeholder is byte-stable);
LaTeX/Typst docks are designed stubs carrying their exact backends and honest
ceilings; Go/C/C++ T2 docks deferred (SCIP/Joern band, §5.7). 140/140 gate
tests green, including the live-Pyright compiler-as-oracle diff and the live
lean CT driver. Hardened by a 74-agent adversarial review
(4 lenses, 2 refuters per finding): 16 confirmed findings, all fixed — see
agentic-convos/ for the full ledger (stale-recording refusal, duplicate-decision
dedup, ownerless-anchor rejections, multi-package grimp, effective ceilings,
verbatim reason taxonomy + notes, symmetric T3 cycle caps).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-structure-extractor.json`); each purpose line was written from the code itself and checked against the file's tests. Source subdirectories carry their own `README.md` with the same table for their files.

| File | Lines | Verified purpose |
|---|---:|---|
| `README.md` | 101 | Package README: quick start (run_skeleton, run_all), ExtractorCell entry points, directory layout, the honesty model (leads vs edges, tier caps, attested lean green only), license posture and status; counts re-verified this audit (140 tests, 149 probe leads). |
| `MEMBRANE-SPEC.md` | 122 | One-page wall contract: face signatures, V1 capability socket + declared friction, what stays a pin, honest-ceiling surface, CT lean face bounds, seven failure classes, catalog census 143+6=149 — each row cross-checked against wall.py/wall_support.py/wall_pin.py and the wall tests. |
| `ASSEMBLY-CHANGES.md` | 323 | Cumulative change record across schema swap, wall promotion, package-root-uri fix, lean-driver spike, LEAN-DOCK wiring, REAL-INPUTS decl matching and the SUB200 restructure; suite trail 68->85->103->104->131->140 and catalog trail 131->137->148->149 both match the live suite (140) and catalog (149). |
| `wall.py` | 186 | Phase-1 wall facade: ExtractorWall.extract() runs the cell and returns the canonical envelope + honestCeilings, honestCeiling(lang) serves declared/undeclared/typed-refusal surfaces, .pins exposes the diagnostic quartet; asserts the schema PIN at construction and before every extract; re-exports the failure classes from wall_support and assemble (wall_pin supplies assert_schema_pin, not classes). |
| `run_skeleton.py` | 31 | Demo script: runs ExtractorCell over fixtures/python with roots=[pkg.a], prints the summary, unusedSet ([pkg.c]) and the first 12 probe events. |
