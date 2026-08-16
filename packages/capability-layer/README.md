# capability-layer

Cell 2 of the proofgraph assembly: measures what a language toolchain can honestly deliver and
hands the result to Tree 3 as a `Capability` with a live `Handle`. `capability(lang)` runs the
A-J pipeline in `capability/` (discovery, gate, score, tree-walk, shim plan, grammar floor,
conditional SCIP, an optional prepare step, LSP wire, library inventory, and the P0-P11 probe
battery) and stamps the *measured* depth tier - CT is unreachable without a real P2 pass
(`HonestCeilingViolation` otherwise), so a paper tier can never inflate the result.

The Phase-1 wall (`wall.py`, which execs `wall_refusals.py` / `wall_pin.py` / `wall_face.py`
into one namespace) verifies the canonical `packages/schema` PIN at every construction, refuses
unknown languages with a typed notice, refuses concurrent runs via a non-blocking lock, and
exposes the pins quartet unchanged. See `MEMBRANE-SPEC.md` for the face contract and failure
classes.

Run the suite: `python -m pytest capability/tests -q` -> 131 passed (includes the live pyright
and lean batteries; both skip LOUDLY when npx/lake are missing).

## Layout

- `capability/` - the A-J pipeline, probe bus + 89-entry catalog, LSP spine, fixtures, import gate
- `capability/floor/`, `capability/shim/` - the stage-F grammar floor; the spawned ybg LSP shim
- `capability/tests/` - the 17-gate suite (131 tests)
- `testbed/` - the mock ybc compiler CLI and the fixture repos the battery drives
- `wall.py` + `wall_refusals.py` / `wall_pin.py` / `wall_face.py` - the Phase-1 membrane
- `agentic-convos/` - historical build transcript (closed 2026-07-19)

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-capability-layer.json`); each purpose line was written from the code itself and checked against the file's tests. Source subdirectories carry their own `README.md` with the same table for their files. Paths are relative to this directory.

| File | Lines | Verified purpose |
|---|---:|---|
| `wall.py` | 111 | Wall facade: the membrane contract docstring, schema PIN constants, module _RUN_LOCK, then execs wall_refusals/wall_pin/wall_face into its own namespace in order so module-import, importlib-by-file, and file-read+exec loads all share one namespace with a fresh lock; __all__ lists the eight public names. |
| `wall_refusals.py` | 74 | Wall section 1 (exec'd, not importable): WallRefusal exception carrying failureClass, WallRefusalNotice (returned, tier=None by construction), registration of the three wall leads into the shared catalog, and _emit_refusal on a private throwaway ProbeBus so no run's history is polluted. |
| `wall_pin.py` | 80 | Wall section 2 (exec'd): _exec_canonical consumes packages/schema as data (file-read+exec with a temporary sys.modules['ids'] shim), and _check_schema_pin verifies the PIN file fields plus canonical check_pin over the actual schema.json hash, emitting a refusal lead and raising WallRefusal(schema-pin-mismatch) on any drift or unreadable package. |
| `wall_face.py` | 122 | Wall section 3 (exec'd): WallPins delegating to the cell quartet; _summarize_battery (per-probe verdicts + greenAllowed only — evidence stays a pin); CapabilityWall carrying measured tier/paperTier/ceiling/provenance/summary and the unwrapped live Handle with idempotent shutdown() emitting terminated state; capability_wall() = pin check, unknown-language typed notice, non-blocking _RUN_LOCK refusing concurrency, then capability() + the construct lead on that run's bus. |
| `MEMBRANE-SPEC.md` | 90 | One-page wall membrane spec: face signatures, pin surface and the 89/92 catalog census, honest-ceiling propagation, the four failure classes, the one-run-at-a-time bound, and the conformance contract — every row verified against wall_face.py and gates 15/15b. |
| `ASSEMBLY-CHANGES.md` | 317 | The cell's labelled-adapter record across four rounds (schema swap, wall, V1 python, CAP-LEAN, SUB200): suite-count lineage 84-95-118-124-131 and catalog lineage 88-91-92 both verified against the current code; SUB200 split table verified against current files. |
| `agentic-convos/tree-2-capability.md` | 142 | Dated build transcript (closed 2026-07-19) of the original cell build and its adversarial review; all claims are past-tense snapshots (77/84 tests, 88-lead catalog) consistent with the recorded lineage — historical log, not current-state documentation. |
