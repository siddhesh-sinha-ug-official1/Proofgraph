# AUDIT-SUMMARY — the adversarial claim-audit round's ledger

> **Historical evidence note.** The `Workspace:` value below is the
> build-machine absolute path where this audit round ran; it is provenance,
> not a runtime input. See `README.md` "Repository scope" and
> `INTEGRATION-MANIFEST.json` `_repoNote`.

**Workspace**: A:\30lean-push\proofgraph
**Round**: agentic-convos/remediation-round.md ([ADVERSARIAL ROUND DESIGN] →
[ADVERSARIAL ROUND LAUNCHED]; 14 Stage-A auditors → 4+ Stage-B refuters →
3 Stage-C builders)
**Written**: 2026-08-03, by the Stage-C root builder, from the 14 refuted-corrected
`audit/AUDIT-*.json` files and the round transcript. Every number below is summed
from those JSONs as they stand on disk (post-refuter values).

## Method (what "audited" means here)

Every non-exempt source file (all ≤200 lines, line-gate-enforced) was read WHOLE
by a Stage-A auditor. Its claims — docstring/header, function docs, load-bearing
comments, its name, probe-catalog descriptions, MEMBRANE-SPEC/README/ASSEMBLY-CHANGES
rows about it — were each verified against the file's actual behavior and its tests,
then classified confirmed / overclaim / underclaim / stale. Doc-side lies were fixed
in place (text only, behavior and identifiers untouched; area suite re-run at its
baseline count afterward). Code-side lies were reported as findings, never patched.
Each file got a one-line `verifiedPurpose` written from the code. Stage-B refuters
then re-read ≥20% of each area's files (weighted to guards/walls/probes) plus every
overclaim and code finding, trying to refute the audit itself; corrections were
written into the JSONs as `refuterNote`s. Stage-C built the README tree from the
corrected JSONs.

## Totals (summed live from the 14 JSONs)

| metric | value |
|---|---|
| areas audited | 14 |
| file entries audited whole | **754** |
| claims examined | **3,671** |
| — confirmed | 3,554 (96.8%) |
| — overclaim | 25 |
| — underclaim | 42 |
| — stale | 50 |
| doc fixes applied (text-only) | **90** |
| code findings (reported, NOT patched) | **12** (11 low, 1 info) |
| refuter corrections recorded in the JSONs | **11** refuterNotes (5 refutations, 6 precision corrections) + 1 missed doc lie found and fixed by a refuter |

## Per-area table

| area (AUDIT-*.json) | files | confirmed | over | under | stale | docFixes | findings | suite after fixes (count unchanged) |
|---|---|---|---|---|---|---|---|---|
| acceptance + faultcheck + root runners | 44 | 310 | 0 | 1 | 8 | 5 | 0 | linegate 0/727 OK · run_demo 11/0/0 · fault-f solo CAUGHT |
| ai | 21 | 90 | 1 | 0 | 0 | 4 | 0 | 14/14 |
| app-src (+ app root configs) | 75 | 361 | 3 | 0 | 5 | 7 | 0 | vitest 111+1 todo · tsc exit 0 |
| app-tests | 39 | 156 | 2 | 1 | 0 | 5 | 0 | vitest 111+1 todo · tsc clean |
| byok-arena | 65 | 207 | 1 | 2 | 6 | 7 | 1 | node --test 103/103 |
| capability-layer | 77 | 339 | 3 | 1 | 4 | 6 | 2 | pytest 131/131 (full live) |
| editor-shell | 125 | 653 | 2 | 16 | 7 | 14 | 3 | npm test 96/96 + import gate + typecheck:monaco |
| graph-model | 51 | 211 | 4 | 2 | 5 | 10 | 1 | 113/113 + demo re-verified |
| graph-view | 58 | 244 | 3 | 6 | 2 | 6 | 1 | vitest 152/152 + tsc clean |
| hub | 30 | 201 | 0 | 5 | 3 | 9 | 1 | 44 OK / 1 env skip |
| outerwall | 29 | 107 | 1 | 2 | 2 | 5 | 1 | 41 OK + real_inputs 21 OK |
| schema | 32 | 106 | 2 | 2 | 1 | 2 | 0 | 23 py OK + --check 8 in sync + 14 ts |
| structure-extractor | 86 | 428 | 2 | 3 | 5 | 5 | 2 | run_all FULL 140/140 |
| vessels | 22 | 141 | 1 | 1 | 2 | 5 | 0 | V1 11 · V2 4 · V3 16 |
| **TOTAL** | **754** | **3,554** | **25** | **42** | **50** | **90** | **12** | |

## The 12 code findings (code does not match its evident claim — reported, never patched)

All carried into the owning per-dir READMEs; severities as recorded by the auditors,
each re-verified by a Stage-B refuter.

1. **hub/server_ws.py** (low) — `_ws_handler`'s bare `except Exception: pass` around
   `backend.start()` and the frame loop swallows real backend errors unnamed (only
   `hub.lsp.close` fires), against the README's "all LOGGED, never silent".
2. **outerwall/analyze_roots.py** (low) — a declared module-ID root (`n_<16hex>`,
   kind module) with zero decl members expands silently to `[]`, so the session
   reports `undeclared=true` despite declared roots; the module-NAME spelling raises
   `UnknownRootDeclared`.
3. **packages/structure-extractor/extractor/ingest.py** (low) — the
   `dock.selected` probe reason calls every non-python dock "design-stub … emits
   candidates as leads only"; false for lean at CT (mints resolved edges + attested
   greens).
4. **packages/structure-extractor/extractor/ingest.py** (low) — the no-lakefile
   root reason still says the Lean dock "would need a Lake project when live";
   the dock is live at CT with the single-file kernel driver, no lake.
5. **packages/capability-layer/capability/probe_p6_p11.py** (low) — P11 hardcodes
   `restart_fast=False` + "re-derived" evidence; the catalog poses it as a measured
   question.
6. **packages/capability-layer/capability/spine_proto.py** (low) — `did_change`
   always stamps version 2; a second change re-sends v2 (spec-nonconforming,
   tolerated by shim/pyright/lean).
7. **packages/graph-model/src/probe/leads_analysis.py** (low) — frozen catalog
   descriptions for `roundtrip.reingest.idsMatch` / `project.ids.text` say the
   reprint is re-ingested; reality is `ids_from_manifest` — reprint bytes never
   parsed (frozen catalog data).
8. **packages/graph-view/src/ingestEdges.ts** (low, pre-documented) — the
   duplicate-edge-id check is dead: `seenEdgeIds` is never `.add()`ed; duplicates
   are only caught downstream at renderGate as `EdgeSetViolation`.
9. **packages/byok-arena/src/adapters/gemini/wire.ts** (low) — `reshapeMessages`
   puts a neutral `role:'tool'` Msg's `toolCallId` in `functionResponse.name`
   (Gemini matches by function NAME; the id belongs in the optional `id` field);
   unreached by the cell's own submit path.
10. **packages/editor-shell/src/mount/mount.ts** (low) — `initWall` is declared but
    never written; `msSinceInit` always emits null.
11. **packages/editor-shell/src/probe/catalog/select-map.ts** (low) — `emit.multi`
    declares policy `'primary-caret'|'all'`; only `'primary-caret'` is ever emitted.
12. **packages/editor-shell/src/buffer/open-probes.ts** (info) — `size.cap`
    declares action `'open'|'degrade'`; no degradation path exists (the probe
    payload itself says so).

## Refuter record (Stage B — the audit itself under attack)

Four passes logged in the transcript, sampling weighted to guards/walls/probes:

- **graph-view + byok-arena + hub** — 34 files (24% / 20% / 23%) + all overclaims
  + all 3 findings re-verified. REFUTED: 0.
- **structure-extractor + editor-shell** — 38 files (22% / 21%). REFUTED: 2
  (assemble.py "all probe first" — three `FakedEdgeError` raise sites probe nothing
  first, docstring fixed + entry reclassified; wall.py re-export provenance) + 1
  catalog.ts precision correction ("six section modules" → five).
- **app-tests + acceptance + outerwall** — 26 files (26% / 22% / 28%) + the
  analyze_roots finding CONFIRMED at source. REFUTED: 0.
- **vessels + ai + app-src** — 34 files (43% / 29% / 25%). REFUTED: 3
  (fsSourceApi.ts / fsSource.ts "every 200 body shape-gated" — postAnalyze,
  fetchPinsHistory, fetchHealth are not; lspTransport.ts stale pre-SUB200 pointer;
  v1_capability_extractor.py phantom acceptance importer) + 2 precision notes.

Three further in-JSON corrections carry refuterNotes in areas whose refuter pass
is not separately logged in the transcript: capability-layer wall.py `__all__`
seven→eight, graph-model test_canonical_sync six→seven tests, schema.json
promoted-facts enumeration missing ruling 7. All eleven notes are in the JSONs.

Net effect of refutation on the audit: 5 verifiedPurpose/claim entries corrected,
6 precision-tightened, 1 additional doc lie fixed (with its suite re-run green,
140/140). No refutation invalidated an area audit wholesale.

## Stage C (what was built from the verified material)

- **80 per-dir README.md files** written or refreshed (21 by the
  hub/vessels/ai/app/acceptance/faultcheck/outerwall builder; 59 by the packages/
  builder), every file table row `name · lines · verifiedPurpose` VERBATIM from
  the corrected JSONs, line counts re-measured on disk; open code findings named
  in the owning READMEs.
- **The root README.md** rebuilt bottom-up (this ledger's sibling deliverable):
  architecture down-links to every per-dir README; verdict-semantics guard chain
  cited; declared limitations reproduced verbatim from REMEDIATION-REPORT.md §4.

## Boundary notes (honesty)

- The **epistemic honesty sweep** (4 verifiers over the report corpus,
  `audit/HONESTY-*.json`) runs as a separate concurrent workflow; none of its
  output files existed on disk when this ledger was written. This ledger counts
  only the claim-audit round.
- Claim counts are the auditors' own granularity (one "claim" ≈ one checkable
  assertion in a doc source); areas differ in how finely they sliced, so
  cross-area claim-count comparisons are indicative, not normalized.
- `verifiedPurpose` lines beginning `UNVERIFIED:` were the required honesty valve;
  no entry in any JSON begins with that prefix — every audited file's purpose was
  verified. (The word appears twice inside capability-layer purpose lines, both
  describing the cell's own "paper claims marked UNVERIFIED" evidence markers.)
