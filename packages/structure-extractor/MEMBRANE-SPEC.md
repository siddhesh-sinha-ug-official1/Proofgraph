# MEMBRANE SPEC — structure-extractor (tree3) · Phase-1 wall

`WALL_VERSION = "structure-extractor-wall/1.0.0"` · stands on schema PIN
(`schemaVersion v0`, `schemaHash 3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c`).
Face module: `wall.py` (package root). The wall is promoted OVER the cell's
diagnostic pins — it never replaces or deletes them.

## The face (typed signatures)

```python
extract_wall(config: PipelineConfig | dict | None = None) -> ExtractorWall

ExtractorWall.extract(
    root: str | Path,
    capability_fn: Callable[[str], CapabilityHandle] | None = None,  # V1 socket
    out_dir: str | Path | None = None,
    config: PipelineConfig | dict | None = None,
) -> {                       # the canonical Graph envelope (assembly ruling 3)
    "schemaVersion": "v0",
    "nodes":  [Node],        # canonical mint n_<16hex>, provenance mandatory
    "edges":  [Edge],        # resolved=true ONLY
    "leads":  [Edge],        # resolved=false ONLY; dstId = "unresolved:"+rawRefName
    "honestCeilings": {lang: HonestCeiling},   # per-dock, verbatim from the pin
}
# LEAN-DOCK round: lean nodes MAY carry real kernel verdicts — fill green
# (origin "checked" + source "lean-kernel:v<ver>:… run=<sha16>") / amber
# (sorry) / red (elaboration error), guarded by the cell's unbacked-green
# assemble gate.  No other language mints a non-unknown fill this round.

ExtractorWall.honestCeiling(lang: str) -> dict
    # declared  -> the dock's ceiling VERBATIM (== honest_ceiling.report perDock[lang])
    # known lang, nothing declared -> {"declared": False, "tier": None, ...} — an
    #   unknown/reduced ceiling surfaces as such; a tier is NEVER fabricated
    # lang outside the Frozen-Schema set -> raises UnknownLanguageError (typed
    #   refusal, capability-wall vocabulary: no depth tier CT/S/G/P exists for it)

ExtractorWall.pins -> WallPins    # the diagnostic quartet, THROUGH the wall:
    .probeCatalog() / .dump() / .history(strip_wall=False) / .tap(id, fn)
```

## V1 socket (capability wall → extractor wall)

`capability_fn(lang) -> CapabilityHandle{lang, tier, handle_kind, handle}` —
defaults to the local `stub_capability`; Phase 2 plugs an adapter over Tree 2's
real `capability()`. **Known friction, documented not fixed (vessel work):**
`CapabilityHandle.handle` is NOT consumed by `ExtractorCell._make_dock` — the
python dock builds its own pyright backend from `PipelineConfig`. Wiring the
real negotiated handle requires a Phase-2 adapter touching `_make_dock`.
Invariant that already holds: the tier the extractor obeys == the tier the
socket reports; non-CT ⇒ zero resolved edges (assemble guard, ruling 2).

## What stays a PIN (reachable only via `pins`)

`t3` (cycles/unused/cross-check), `summary`, `decisions`, `anchors`,
`sourcesets`, `tallies`, and the whole probe stream. The cell's internal t3 is
diagnostic — the composed-graph gap analysis happens in Phase 3 over the WHOLE
organism, so t3/summary do not cross the face. One wall = one probe stream
(construction pin-check + every extract, ordered by logicalClock).

## Honest-ceiling surface

Declared ceilings cross the face byte-identical to the
`extractor.output.honest_ceiling.report` pin. Undeclared → explicit
`declared: False, tier: None` surface. Unknown language → typed refusal.
No path through the wall can mint a tier, a verdict, or green — verdicts
enter ONLY through a dock's real checker (lean kernel driver at measured CT)
and are re-audited by the assemble unbacked-green gate.

## The CT lean face (LEAN-DOCK round) + its bounds

At a CT capability response the lean dock drives the PROVEN kernel driver
(`extractor/docks/lean_driver/`, `lean --run Driver.lean <file>`, cwd-pinned
toolchain **leanprover/lean4:v4.31.0**) once per file and surfaces:

- resolved `proof_uses` from `decls[].refs`, filtered to the ingested decl
  set (resolver `lean-kernel`; drops = probed rejections, never silent);
- module `imports` from the elaborated header (implicit `Init` = probed
  `X_CORE` rejection);
- fills: green = kernelAccepted ∧ ¬usesSorry ∧ unexpectedAxioms=[] in an
  error-free file; sorry → amber; error-in-span → red; unjudged → unknown
  (NEVER green from absence; an errored file blocks green conservatively);
- the lean HonestCeiling `extra` carries: `driverLimits` (the driver's
  limits[] VERBATIM — single-file bound included), `unusedHypothesesSummary`
  (per-decl unused binders; per-decl payloads ride the probe stream —
  the Node schema stays CLOSED), `toolchainPinDivergence` (driver v4.31.0 vs
  cell-2 lean_repo v4.32.0 — DECLARED, not unified), `driverDeadFiles`.

Bounds: single-file driver (multi-file lake declared-not-implemented);
~3s warm / ~76s cold per invocation, probed per-invocation
(`extractor.t2.lean.driver.timing`); no per-ref source positions
(InfoTree-free); driver-dead (timeout/crash/bad-json) is a typed failure —
decls stay unknown, anchors become `U_BACKEND_*` leads, no partial green.
At any non-CT tier the dock behaves exactly as the pre-round placeholder
(T1 nodes + leads only; tier-G golden byte-stable).

## Failure classes (`wall.FAILURE_CLASSES`)

| class | raised by | meaning |
|---|---|---|
| `schema-pin-mismatch` | wall (birth + every extract) | cell pin vs canonical PIN vs recomputed schema.json hash disagree, or unverifiable |
| `unknown-language` | `honestCeiling` | lang outside the Frozen-Schema set; no tier fabricated |
| `lead-in-edges` | `validate_envelope` | a lead in `edges[]`, a resolved row in `leads[]`, or a lead without the `unresolved:` prefix |
| `id-mismatch` | `validate_envelope` | an envelope id fails canonical-mint recompute |
| `tier-inflation` | cell assemble guard, propagates unwrapped | resolved edge claimed at a non-CT tier |
| `faked-edge` | cell assemble guard, propagates unwrapped | resolved edge without a matching resolved decision |
| `unbacked-green` | cell assemble guard (+ SchemaNode.validate), propagates unwrapped | a green fill without a kernel attestation (origin ≠ "checked", unregistered fill.source, or a non-CT tier) — LEAN-DOCK round |

Every refusal is probed (`extractor.wall.refusal` + `extractor.wall.pin.check`).

## Versioning & conformance contract

Wall semver in `WALL_VERSION`; schema PIN asserted at construction AND before
every `extract()`. Probe catalog: 143 pre-wall entries (131 at wall promotion
+ 11 additive LEAN-DOCK leads: 9 CT-driver + 2 green-guard; + 1 additive
REAL-INPUTS lead `extractor.t2.lean.decl.match`) + 6 `extractor.wall.*` leads
(149 total; additive only). Conformance
(`selftest/test_wall_conformance.py` + `test_wall_face.py` since the SUB200
split, run with the cell suite) = pins vs face:
envelope == assemble-stage pins (`extractor.assemble.*`), zero resolved edges
from any non-CT tier (forged ⇒ `tier-inflation` THROUGH the wall), every lead
prefixed, edge ids recompute under `packages/schema/ids.py`, ceilings verbatim,
quartet live, plain (wall-less) cell runs never fire `extractor.wall.*`.
