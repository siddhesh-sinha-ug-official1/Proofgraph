# MEMBRANE-SPEC — capability-layer wall

`wall.py` at this package root. `WALL_VERSION = "capability-layer-wall/1.0.0"`.
Schema PIN carried and asserted at every construction: `schemaVersion v0`,
`schemaHash 3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c`.

## The face (typed signatures)

```python
capability_wall(lang: str, repo: str | None = None, config: dict | None = None)
    -> CapabilityWall | WallRefusalNotice        # raises WallRefusal (below)

CapabilityWall:                      # one finished capability() run
  known: True
  lang: str
  tier: "CT"|"S"|"G"|"P"             # MEASURED (probe battery), never paper
  paperTier: str                     # the rubric's claim; gap visible on the face
  honestCeiling: str                 # canonical HONEST_CEILINGS[tier] text
  provenance: {extractor: str, resolved: bool}   # ruling 2: resolved ⇔ tier==CT
  probeReport: {measuredTier, paperTier, p2, greenAllowed, coldStartNanos,
                restartFast, probes: [{id, ran, verdict}]}   # SUMMARY only
  handle: Handle                     # the live cell Handle, UNWRAPPED —
                                     #   request(method, params) on lsp-kind,
                                     #   parse(text) where a stub grammar exists
                                     #   (ybg/awk; python+lean have no floor —
                                     #   logged bound, parse() raises)
  shutdown() -> None                 # terminates the live LSP child (idempotent)
  pins: {probeCatalog(), dump(), history(), tap(id, fn)}     # the quartet
  wallVersion: str · schemaPin: {schemaVersion, schemaHash}

WallRefusalNotice:                   # unknown language — typed, RETURNED
  known: False · failureClass: "unknown-language" · tier: None
  honestCeiling: "no profile — tier unknown" · lang · wallVersion
```

## What stays a pin (reachable only through `pins`)

Raw probe evidence (request/response/wire firehose), discovery sweep, scorecard,
treewalk, shim state, cache keys, library inventory, the full battery with
evidence strings — `pins.dump()` / `pins.history()` / `pins.tap()` delegate to
the cell's module-global quartet. Wall leads added to the catalog (88 → 91 at
Phase 1, additive; the CAP-LEAN round later added `capability.wire.prepare`,
so the cell catalog is now 89 and 92 with the wall loaded):
`capability.wall.construct`, `capability.wall.refusal`,
`capability.wall.shutdown`. Construct/shutdown fire on the wall's own run bus
(visible in `history()` while that run is the last run); refusals fire on a
private bus (tap-observable, never pollute another run's stream).

## Honest-ceiling surface

`tier` is the measured verdict; `honestCeiling` is the canonical ceiling text
for that tier; `probeReport.greenAllowed == green_allowed(tier, p2)` — green
only for CT + P2-pass. A language outside `fixtures.PROFILES` surfaces
`known=False, tier=None` — **this is where "an unknown-tier language surfaces
unknown at the outer wall" enters the organism**: no profile ⇒ no tier, no
verdict, no green, and the refusal itself is a lead. Reduced tiers (zigish:
paper CT, measured S) cross the wall reduced, never inflated.

## Failure classes

| class | surfaced as | when |
|---|---|---|
| `schema-pin-mismatch` | raise `WallRefusal` | canonical `packages/schema` missing, unreadable, or drifted from the PIN (checked every construction; canonical files consumed as data — file-read + exec, no import-gate churn) |
| `unknown-language` | return `WallRefusalNotice` | `lang` not in `fixtures.PROFILES` — never a crash, never a fabricated tier |
| `concurrent-run-unsupported` | raise `WallRefusal` | a second wall-mediated run while one is in flight |
| `tier-inflation` (`HonestCeilingViolation`) | passes through unwrapped | the cell's own enforcement; the wall adds no verdicts |

## Concurrency bound (recorded decision)

The cell's `dump()`/`history()` are module-global last-run state. The wall
enforces **one-capability-run-at-a-time** with a non-blocking module lock
(`_RUN_LOCK`); a concurrent construction is *refused* with
`concurrent-run-unsupported` rather than queued (deterministic; keeps
pins-vs-face reads honest). Sequential runs overwrite `dump()`/`history()` —
read pins for a run before starting the next. Cell-internal callers invoking
`capability()` directly bypass the wall and its lock.

## Versioning & conformance contract

Additive-only under `capability-layer-wall/1.x`; any face/failure-class break
bumps the major. Conformance = `capability/tests/test_15_wall_conformance.py`
+ `test_15b_wall_runs.py` (SUB200 split; one shared wall namespace via
`tests/wall_common.py`; runs with the cell suite): drives the wall on the CT
and fake-green fixtures,
then asserts every declared field equals the pin-level truth
(`capability.probe.measuredTier` / `capability.score.paperTier` /
`capability.probe.faked` / per-probe verdict pins / `dump()["capability"]`),
plus the schema-pin negative gates, the typed unknown-language refusal, the
concurrency refusal, and a **no-leaked-process check** after `shutdown()` on a
CT run. Declared may never diverge from probed.
