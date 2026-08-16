# REPORT-SUB200 — packages/editor-shell

Adversarial-round prep: every non-exempt source file in the area is now under
the 200-line hard ceiling. Behavior-preserving splits only; every original
module path remains as a facade re-exporting its full historical surface;
external importers (other areas, cells, hub, tests) needed ZERO changes.

## Splits performed

| old file (lines) | new modules (lines) |
|---|---|
| src/cell.ts (513) | cell.ts facade (11) + src/cell/cell.ts (181) + open.ts (189) + features.ts (124) + diag-flow.ts (64) + introspection.ts (48) + config.ts (41) |
| test/stub/stub-server.ts (478) | stub-server.ts (197) + stub-server-config.ts (94) + stub-server-text.ts (186) + stub-server-features.ts (71) + stub-server-init.ts (57) |
| src/map/span-index.ts (458) | span-index.ts (195) + geometry.ts (194) + build-nodes.ts (198) |
| src/verdict/verdict.ts (452) | verdict.ts (199) + fill-decision.ts (196) + tooltip.ts (74) + verdict-types.ts (48) |
| src/lsp/pump.ts (452) | pump.ts (181) + incoming.ts (181) + feature-payloads.ts (121) + lsp-types.ts (48) |
| scripts/gen-fixture-nodes.mjs (430) | gen-fixture-nodes.mjs entry (67) + fixture-gen/helpers.mjs (63) + fixtures-basic.mjs (164) + fixtures-edge.mjs (175) + outline-cases.mjs (15) |
| src/buffer/buffer-manager.ts (420) | buffer-manager.ts (177) + buffer-state.ts (80) + open-probes.ts (89) + change-handler.ts (99) + roundtrip.ts (65) |
| src/probe/catalog.ts (396) | catalog.ts aggregator (46) + catalog/spec.ts (39) + mount-buffer.ts (69) + conn-lsp.ts (100) + diag-verdict.ts (82) + select-map.ts (72) + render-gate-wall.ts (64) |
| src/conn/connector.ts (380) | connector.ts (184) + conn-types.ts (41) + handshake.ts (176) + reconnect.ts (55) |
| test/22-wall-conformance.test.ts (375) | 22-wall-conformance.test.ts (191) + 22b-wall-teardown.test.ts (129) + helpers/wall-harness.ts (90) |
| test/20-review-regressions.test.ts (344) | 20-review-regressions.test.ts (122) + 20b-review-spanmath.test.ts (128) + 20c-review-protocol.test.ts (90) + helpers/synthetic-node.ts (21) |
| test/03-brushing.test.ts (306) | 03-brushing.test.ts (164) + 03b-brushing-edges.test.ts (137) + helpers/select-payloads.ts (32) |
| test/02-diagnostics-span.test.ts (276) | 02-diagnostics-span.test.ts (133) + 02b-diagnostics-multibyte.test.ts (124) + helpers/diag-payloads.ts (31) |
| src/mount/monaco/monaco-adapter.ts (268) | monaco-adapter.ts (192) + darcula-theme.ts (39) + decorations.ts (37) + monaco-events.ts (51) |
| test/08-lsp-messages.test.ts (262) | 08-lsp-messages.test.ts (142) + 08b-lsp-inbound.test.ts (115) + helpers/server-behaviors.ts (18) |
| src/diagnostics/diagnostics.ts (259) | diagnostics.ts (125) + map-diagnostic.ts (170) |
| test/19-catalog.test.ts (258) | 19-catalog.test.ts (197 — the WIDE scenario is ONE test, kept intact) + 19b-catalog-invariants.test.ts (54) + helpers/catalog-consts.ts (25) |
| test/01-buffer.test.ts (253) | 01-buffer.test.ts (136) + 01b-buffer-mutations.test.ts (111) + helpers/buffer-payloads.ts (20) |
| demo/main.tsx (213) | main.tsx (157) + demo/demo-cell.ts (84) |
| test/04-green-guard.test.ts (212) | 04-green-guard.test.ts (116) + 04b-green-guard-tiers.test.ts (74) + helpers/green-guard.ts (46) |
| test/stub/stub-adapter.ts (211) | stub-adapter.ts (194) + stub-adapter-defaults.ts (24) |

Facade guarantees:

- All original module paths remain (src/cell.ts, src/map/span-index.ts,
  src/verdict/verdict.ts, src/lsp/pump.ts, src/buffer/buffer-manager.ts,
  src/probe/catalog.ts, src/conn/connector.ts, src/diagnostics/diagnostics.ts,
  src/mount/monaco/monaco-adapter.ts, test/stub/stub-server.ts) and re-export
  the exact historical named surface. src/index.ts and src/wall.ts untouched.
- Internal-only widenings are documented @internal (cell fields consumed by
  src/cell/* siblings; stub-server members consumed by its handler modules);
  no pre-existing public name changed or removed.

## Probe-catalog identity proof

PROBE_CATALOG is now assembled from six section modules spliced IN THE
ORIGINAL ORDER (mount, buffer, conn, lsp, diag, verdict, select, map, render,
probe, gate, wall). 128 entries, ids and order identical to the pre-split
single file; FIREHOSE_IDS (10 leads) unchanged. Pinned live by test 19b
(unique ids, kinds, firehose-set equality), test 22b
(deepEqual(pins.probeCatalog(), PROBE_CATALOG), >= 128, wall leads present),
and the wide-scenario test 19 (every fired lead cataloged).

## Fixture-generator byte-stability proof

Per the caution: the split generator was run against a TEMP directory (scratch
verify script driving the same section functions with a redirected fixDir)
and every output byte-compared to the committed test/fixtures/:
clean.py, type-error.py, multibyte.py, whitespace.py, nested.py, tier-g.tex,
schema-nodes.json, fixture-meta.json, outline-fixture.json — ALL
BYTE-IDENTICAL. Committed fixtures were never rewritten. The entry point
(npm run gen:fixtures → scripts/gen-fixture-nodes.mjs) and its stdout summary
are unchanged.

## Suite results (end state)

- npm test (build + import gate + node --test): 96/96 pass, 0 fail
  (baseline 96 → 96; test files 23 → 31 via splits, total test count
  unchanged, no assertion weakened).
- Import gate: PASS — 54 files scanned (was 41; additive census),
  externals monaco-editor only, allow-lists byte-unchanged, no monaco leak
  (all new monaco-touching modules live under src/mount/monaco/).
- typecheck:monaco: green (includes demo/** and test/stub/**, so the demo
  and stub splits are in the browser-tier census).
- Byte-stability duties: packages/schema "python schemagen.py --check" exit 0
  ("8 generated artifacts in sync"); goldens untouched (this area holds none);
  committed fixtures byte-identical (above).
- dist/ was fully cleaned and rebuilt so no stale pre-split compiled files
  survive for the runner/gate to pick up.

## Exemptions relied on

- package-lock.json (1916) — lockfile.
- test/fixtures/schema-nodes.json (369), test/fixtures/fixture-meta.json (201)
  — generated fixture data (authored by gen-fixture-nodes.mjs; byte-verified
  above; data files, not source).

## Verification table — every file in the area

All counts via wc -l, post-restructure. Ceiling: <200 for every non-exempt
source file.

| file | lines |
|---|---|
| demo/demo-cell.ts | 84 |
| demo/index.html | 12 |
| demo/main.tsx | 157 |
| demo/styles.css | 78 |
| package-lock.json | exempt: lockfile (1916) |
| package.json | 32 |
| scripts/fixture-gen/fixtures-basic.mjs | 164 |
| scripts/fixture-gen/fixtures-edge.mjs | 175 |
| scripts/fixture-gen/helpers.mjs | 63 |
| scripts/fixture-gen/outline-cases.mjs | 15 |
| scripts/gen-fixture-nodes.mjs | 67 |
| scripts/import-gate.mjs | 45 |
| scripts/run-tests.mjs | 26 |
| src/buffer/buffer-manager.ts | 177 |
| src/buffer/buffer-state.ts | 80 |
| src/buffer/change-handler.ts | 99 |
| src/buffer/open-probes.ts | 89 |
| src/buffer/roundtrip.ts | 65 |
| src/cell.ts | 11 |
| src/cell/cell.ts | 181 |
| src/cell/config.ts | 41 |
| src/cell/diag-flow.ts | 64 |
| src/cell/features.ts | 124 |
| src/cell/introspection.ts | 48 |
| src/cell/open.ts | 189 |
| src/conn/conn-types.ts | 41 |
| src/conn/connector.ts | 184 |
| src/conn/handshake.ts | 176 |
| src/conn/reconnect.ts | 55 |
| src/diagnostics/diagnostics.ts | 125 |
| src/diagnostics/map-diagnostic.ts | 170 |
| src/gate/import-gate.ts | 133 |
| src/index.ts | 27 |
| src/lsp/feature-payloads.ts | 121 |
| src/lsp/incoming.ts | 181 |
| src/lsp/lsp-types.ts | 48 |
| src/lsp/pump.ts | 181 |
| src/map/build-nodes.ts | 198 |
| src/map/geometry.ts | 194 |
| src/map/span-index.ts | 195 |
| src/mount/adapter.ts | 116 |
| src/mount/monaco/darcula-theme.ts | 39 |
| src/mount/monaco/decorations.ts | 37 |
| src/mount/monaco/monaco-adapter.ts | 192 |
| src/mount/monaco/monaco-events.ts | 51 |
| src/mount/mount.ts | 110 |
| src/probe/catalog.ts | 46 |
| src/probe/catalog/conn-lsp.ts | 100 |
| src/probe/catalog/diag-verdict.ts | 82 |
| src/probe/catalog/mount-buffer.ts | 69 |
| src/probe/catalog/render-gate-wall.ts | 64 |
| src/probe/catalog/select-map.ts | 72 |
| src/probe/catalog/spec.ts | 39 |
| src/probe/probe-bus.ts | 168 |
| src/render/render.ts | 158 |
| src/schema/pin.ts | 48 |
| src/schema/schema.ts | 114 |
| src/seams/bus.ts | 35 |
| src/seams/capability.ts | 45 |
| src/selection/selection.ts | 191 |
| src/util/encoding.ts | 141 |
| src/util/sha256.ts | 67 |
| src/verdict/fill-decision.ts | 196 |
| src/verdict/tooltip.ts | 74 |
| src/verdict/verdict-types.ts | 48 |
| src/verdict/verdict.ts | 199 |
| src/wall.ts | 181 |
| test/00-smoke.test.ts | 76 |
| test/01-buffer.test.ts | 136 |
| test/01b-buffer-mutations.test.ts | 111 |
| test/02-diagnostics-span.test.ts | 133 |
| test/02b-diagnostics-multibyte.test.ts | 124 |
| test/03-brushing.test.ts | 164 |
| test/03b-brushing-edges.test.ts | 137 |
| test/04-green-guard.test.ts | 116 |
| test/04b-green-guard-tiers.test.ts | 74 |
| test/05-outline.test.ts | 179 |
| test/06-version-guard.test.ts | 103 |
| test/07-latency.test.ts | 156 |
| test/08-lsp-messages.test.ts | 142 |
| test/08b-lsp-inbound.test.ts | 115 |
| test/09-import-gate.test.ts | 198 |
| test/10-determinism.test.ts | 89 |
| test/11-symbol-reconcile.test.ts | 136 |
| test/12-hover.test.ts | 150 |
| test/13-index-stability.test.ts | 185 |
| test/14-origin.test.ts | 139 |
| test/15-provenance.test.ts | 138 |
| test/16-reconnect.test.ts | 132 |
| test/17-same-span.test.ts | 138 |
| test/18-editor-agnostic.test.ts | 195 |
| test/19-catalog.test.ts | 197 |
| test/19b-catalog-invariants.test.ts | 54 |
| test/20-review-regressions.test.ts | 122 |
| test/20b-review-spanmath.test.ts | 128 |
| test/20c-review-protocol.test.ts | 90 |
| test/21-schema-sync.test.ts | 132 |
| test/22-wall-conformance.test.ts | 191 |
| test/22b-wall-teardown.test.ts | 129 |
| test/fixtures/clean.py | exempt: generated fixture (10) |
| test/fixtures/fixture-meta.json | exempt: generated fixture data (201) |
| test/fixtures/multibyte.py | exempt: generated fixture (4) |
| test/fixtures/nested.py | exempt: generated fixture (6) |
| test/fixtures/outline-fixture.json | exempt: generated fixture data (71) |
| test/fixtures/schema-nodes.json | exempt: generated fixture data (369) |
| test/fixtures/tier-g.tex | exempt: generated fixture (2) |
| test/fixtures/type-error.py | exempt: generated fixture (11) |
| test/fixtures/whitespace.py | exempt: generated fixture (4) |
| test/helpers/buffer-payloads.ts | 20 |
| test/helpers/catalog-consts.ts | 25 |
| test/helpers/diag-payloads.ts | 31 |
| test/helpers/green-guard.ts | 46 |
| test/helpers/select-payloads.ts | 32 |
| test/helpers/server-behaviors.ts | 18 |
| test/helpers/synthetic-node.ts | 21 |
| test/helpers/wall-harness.ts | 90 |
| test/stub/assert-probes.ts | 68 |
| test/stub/harness.ts | 134 |
| test/stub/stub-adapter-defaults.ts | 24 |
| test/stub/stub-adapter.ts | 194 |
| test/stub/stub-capability.ts | 48 |
| test/stub/stub-graph-pane.ts | 36 |
| test/stub/stub-server-config.ts | 94 |
| test/stub/stub-server-features.ts | 71 |
| test/stub/stub-server-init.ts | 57 |
| test/stub/stub-server-text.ts | 186 |
| test/stub/stub-server.ts | 197 |
| test/stub/stub-transport.ts | 86 |
| tsconfig.json | 19 |
| tsconfig.monaco.json | 24 |
| vite.config.ts | 15 |

(dist/, demo-dist/, node_modules/ are build outputs, not source.)

## Notes / observations (no fixes applied — behavior-preserving round)

- 19-catalog.test.ts sits at 197: its WIDE scenario is a single ~170-line test
  whose fired-lead union spans four cells plus the gate; splitting it would
  restructure the union accumulation (semantic risk) — left intact under the
  ceiling.
- Not a bug, recorded for completeness: BufferManager.open() now rebuilds an
  internal state record; the pre-split instance-lifetime silentCount was
  deliberately carried across open() calls to keep the old field semantics
  exactly (open() never reset it).

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 11 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: src/cell/cell.ts 181→182; src/index.ts 27→29; src/lsp/lsp-types.ts 48→51; src/probe/catalog.ts 46→49; src/probe/catalog/conn-lsp.ts 100→104; src/probe/catalog/diag-verdict.ts 82→86; src/probe/catalog/mount-buffer.ts 69→72; src/probe/catalog/render-gate-wall.ts 64→67; src/probe/catalog/select-map.ts 72→74; src/util/sha256.ts 67→71; test/07-latency.test.ts 156→155. Area max is still 199 (src/verdict/verdict.ts). PROBE_CATALOG sections re-counted: still 128 entries. All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
