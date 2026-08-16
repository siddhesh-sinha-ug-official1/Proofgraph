# Phase 2 architecture — vasculature (frozen before vessel work)

The honest shape: a **Python backend** (cells 1–3 in one process), a **React frontend**
(cells 4–5 in one vite app), an **AI service** (cell 6, server-side Node), and the
**backend hub** bridging them. Vessels connect walls, never cytoplasm.

## New assembly components (not cells — assembly code, fully probed)

```
proofgraph/
  hub/        Python: imports the three Python walls; runs extract→ingest; serves HTTP+WS
  app/        Vite/React: editor-shell (Monaco tier) + graph-view + the V5 bus adapter
  ai/         Node: byok wall server-side; /ask over the composed graph (keys never leave)
```

- hub HTTP: stdlib http.server (zero new deps) — GET /graph (canonical envelope),
  /query?kind=…, /verdicts/{nodeId}, /pins/* (aggregated diagnostics for the outer wall).
- hub WS (the V2 LSP bridge): `websockets` (BSD-3 — permissive, license-gate pass, LOGGED
  as the hub's one third-party dep) bridging editor MessageTransports ↔ capability handle.

## THE composition finding: disjoint language sets (V1)

Cell 2 measures ONLY {yaddabinggiberish, awk, zigish} (fixture registry; KeyError otherwise).
Cell 3's only real CT dock is **python** (grimp + live/recorded pyright). Zero overlap.
A naive V1 swap would leave python "unknown" at cell 2 → leads-only extraction → the moat
demo (unused Python function) dies; keeping cell 3's stub tier would violate the vessel
invariant (tier the extractor sees == tier cell 2 REPORTS — no silent upgrades).

**Ruling (V1 scope):** teach cell 2 a real `python` profile — a labelled change request
against its tree, applied to the COPY: profile registry entry + repo fixture + server wiring
`cmd /c npx --yes -p pyright pyright-langserver --stdio`, then let cell 2's own P0–P11
battery MEASURE python's tier live. No asserted tiers: if the battery honestly lands below
CT (its P6/libinventory probes are ybg-flavored — inventory risk), that reduced tier flows
through as reduced resolution and the demo surfaces it honestly. This is the vessel doing
exactly what the master contract says: the extractor's stub replaced by cell 2's REAL handle.
(Cell 3's live-pyright oracle on this same machine proves pyright LSP works here.)

## The six vessels (agents get one each; every connector test asserts on BOTH cells' pins)

| # | Vessel | Test asserts (pins × pins) |
|---|--------|---------------------------|
| V1 | cap wall → extractor `capability_fn` (+ python profile in cell 2) | extractor's `extractor.ingest.capability.response` tier == cell 2's scorecard/measured-tier pin; S/G tier ⇒ zero resolved edges (tier-inflation guard fires) |
| V2 | cap wall → editor via hub WS bridge | P2-style type error in the demo file → `publishDiagnostics` → editor `editor.diag.*` pins show the squiggle span; both sides' probe streams carry the same uri+version |
| V3 | extractor wall → graph-model wall `ingest` | every Node.id/Edge.id byte-identical across the seam (extractor `extractor.t1.node.id` preimage pins × wall id-verify pins); leads stay leads |
| V4 | graph-model wall → graph-view wall (HTTP, Py↔TS) | T5 `dump().rfNodes/rfEdges/leads` set-equality vs hub-served envelope vs T1 `dump()` — three-way; IDs byte-preserved; `unknown` renders unknown |
| V5 | editor bus ⇄ graph-view bus (adapter in app/) | select in editor → T4 busLog pin + T5 `link.select.in` pin carry the SAME nodeId (and reverse); no echo storm (clock/origin guards hold) |
| V6 | byok wall ⇄ system (ai/ service) | answer references real node ids from the served graph; leak scan through wall pins: rawKeyFound:false + negative control; no key material in any hub/app payload |

End-to-end probe trace (system round-trip gate): one source file; one Node.id proven
byte-identical at extraction → model → hub → view → editor selection, from aggregated history().

## Seam-failure catalog (named classes; grows as vessels land)
- schema-pin-mismatch · id-mismatch · lead-in-edges · tier-inflation · silent-tier-upgrade
- envelope-version-mismatch · serializer-edge-drop (V4's raison d'être)
- bus-echo-storm · bus-shape-mismatch (V5)
- bus-origin-spoof (V5: an event claiming the far side's identity injected at the wrong
  bus port is never cross-forwarded — dropped + logged; each cell's own guard probes it)
- hover-unbridged (V5 degradation: T4's bus has no hover event, so hover is select-only —
  probed on T5's pins as link.hover.unsupported + declared in the adapter log, never silent)
- unknown-language (typed refusal, propagates to unknown verdicts — never green)
- insecure-master-secret · key-leak (V6)
- tool-loop-exceeded · graph-data-stale · unknown-tool (V6 outlet skeleton: single-round
  bound exceeded; provenance minted from a different graph snapshot; model requested a tool
  outside the declared four — answered isError, never dropped)
- lsp-bridge-drop (V2: message lost/reordered across the WS bridge)
- lsp-backend-dead (V2: a client frame arriving after the bridged LSP child
  died is dropped LOUDLY — hub.lsp.backend.write.failed — and deliberately
  NOT ledgered as delivered, so the session audit names the loss
  lsp-bridge-drop instead of pretending delivery; child EOF closes the WS
  connection via the bridge's additive close hook, so the editor's
  disconnect/give-up probes fire instead of hanging)
- pipeline-busy (hub: /analyze while a pipeline run is in flight — serialized, never queued)
- lsp-backend-busy (hub: second concurrent WS session on a single-instance LSP backend)
- hub-bad-request · unknown-endpoint (hub HTTP vocabulary: malformed input / no such route)
- cross-origin-denied (pre-GitHub S1/S2, both localhost servers: a state-changing
  PUT/POST from a browser Origin that is not an allowlisted LOOPBACK app origin
  is refused 403 — nothing mutated, the ai server's key-holding wall never driven;
  a foreign Origin also receives NO Access-Control-Allow-Origin, so the browser
  blocks the read. No-Origin callers (curl, the acceptance runners, server-to-
  server) are unaffected. Allowlist: hub/cors.py + ai/server/cors.ts — the vite
  face :5199 and dev hub/ai/ws ports plus any loopback origin for the ephemeral-
  port acceptance UI; probed hub.http.refused on the hub)
- sys-path-shadowing (V3: two Python cells composed in ONE process colliding on a
  top-level module name — incl. the dual root `wall.py` ambiguity where a bare
  `import wall` binds whichever cell root comes first on sys.path; `vessels/pathing.py`
  is the sanctioned wiring and refuses loudly, never a silent mis-wire)
- root-vocabulary-mismatch (V3: extractor T3 roots are canonical NAMES, modules allowed —
  model-wall roots are DECL-NODE IDS, modules refused; naive piping of cfg.roots across
  the seam yields unknown-root. The vessel translates name→decl-node-id; an all-module
  graph has NO valid model-wall roots and reachable/unused honestly refuse
  roots-undeclared)
- orphaned-subprocess-tree (V1: killing only the `cmd /c npx` wrapper orphans the
  node/pyright child — closed by `_tree_kill` in cell 2's spine, mirroring cell 3's
  backend fix; swept by V1's and gate-16's no-orphan checks against a pre-run baseline)
- unrecorded-stub-fallback (V1: a local-stub capability answer crossing the seam without
  a recorded capability-layer refusal — the vessel writes the provenance record BEFORE
  any stub handle exists, so the class is structurally unreachable; tested on lean)
- outline-vocabulary-leak (P3 outer wall, BUILD-FAILING: a string outside the frozen
  7-token vocabulary in any worstOf — incl. the banned fused "none/green" and any fill
  status outside the frozen enum feeding token derivation. outerwall/outline.py raises
  before anything is served; tested directly in outerwall/test_outerwall.py)
- outline-closure-disagreement (P3, BUILD-FAILING: rustworkx and networkx disagree on a
  node's reflexive-transitive base — the two-library idiom applied to the ruling-8
  closure itself; per-node crosscheck in outerwall/outline.py, agreement pinned on
  outerwall.outline.closure)
- provenance-hole (P3, BUILD-FAILING: an element of the analyzed graph with missing or
  incomplete {cell, tier, extractor, resolved} provenance — outerwall/provenance.py
  assert_no_holes raises + pins outerwall.provenance.hole; tamper-tested)
- bad-source-root (P3: analyze() on a nonexistent path — typed refusal, logged)
- no-analysis-computed (P3 hub additive: GET /analysis before any analyze() result was
  attached — 503 + hub.serve.analysis.refused; the hub never fabricates an analysis)
- analysis-shape-mismatch (P3 human face: a 200 GET /analysis body off the
  OUTERWALL-CONTRACT analyze() shape {graph, verdicts, provenance, gapAnalysis} is refused
  WHOLE by app/src/analysisSource.ts — never a partial accept; a typed "not yet" refusal
  (unknown-endpoint / no-analysis-computed / no-graph-ingested) is PENDING instead:
  the pane renders /graph as served, null outlines stay not-yet-computed, never green)
- analysis-graph-mismatch (P3 human face: /analysis verdicts referencing node ids absent
  from the byte-gated served envelope — verdicts minted from a DIFFERENT snapshot; V6's
  graph-data-stale semantics applied at the view seam; overlay refused, ids never invented)
- ai-bad-request · ai-live-key-missing · hub-unreachable · ai-server-unreachable (P3 ai
  server + app transport vocabulary: malformed /ask input; --live without AI_API_KEY in the
  server process env; hub transport death — served typed, rendered as NAMED banners, never
  a blank page. hub-unreachable/hub-bad-response originated as V4 graphSource classes)
- key-leak, response-gate leg (P3 ai server: guard 2 on top of the V6 outlet scrub — every
  serialized /ask//health response is re-scanned for the process's own key material before
  writing; a hit replaces the payload with a 500 typed key-leak refusal. Fired end-to-end
  by ai/test/p3.server.custody.test.ts's planted-masterSecret negative control; the browser-bundle
  leg is app/test/p3.build.gate.test.ts's automated grep of the built dist output)
- package-root-uri-mismatch (P3 BOUND → **FIXED, remediation round**: cell 3 detects a
  python package's PARENT as the pyright/grimp project root but built didOpen URIs by
  joining ingest-root-relative paths onto it; extracting a package dir DIRECTLY
  mis-rooted the URIs (`<parent>/core.py`, an unopened non-file) and live call
  resolution silently degraded to leads. FIX applied as the recorded change request on
  cell 3's COPY (packages/structure-extractor ASSEMBLY-CHANGES.md, remediation round):
  pyright_backend builds every LSP wire uri from the didOpen'd ABSOLUTE path under the
  detected project root and maps responses back into the dock's rel vocabulary — node
  ids / span.file vocabulary unchanged for a given ingest root, only wire paths;
  regression-gated by selftest/test_live_pyright_oracle.py::
  test_bare_package_dir_resolves_live (bare-dir LIVE extract must carry
  pyright-resolved calls edges — the bug's signature inverted — with full relation
  parity vs the parent-root run). The outer wall's copy-staging of bare package dirs is
  RETIRED (outerwall/analyze.py _normalize_root); single-FILE staging stays (the
  extractor walks dirs), sha256-pinned. The outerwall.root.staged probe STAYS and
  records the direct decision (mode: "direct"). Declared consequence, never smoothed:
  span.file / ids are ingest-root-relative, so a bare-dir extract mints "core.py" not
  "<pkg>/core.py" — root-sensitivity of the structural identity; parent-root layouts
  (serve_app / run_shell_demo workspace = package parent) are byte-identical to before
  the fix, proven by run_shell_demo's unchanged unused ids)
- acceptance-evidence-missing (§7 runner: the headless walls suite
  (app/test-acceptance/) refuses LOUDLY when acceptance/analysis-*.json are absent —
  it never mints its own analysis; acceptance/run_demo.py writes the REAL analyze()
  outputs first, and a missing/failed evidence file fails the named check, never
  silently passes it)
- browser-tooling-missing (§7 runner, step 3: no Chromium binary found for the
  CDP-driven check — since the HEADLESS-UI round the DEFAULT step-3 driver is
  acceptance/headless/headless_ui.mjs (DOM/a11y + spike-surface pins, ZERO pixel
  screenshots; browser_shot.mjs stays a MANUAL screenshot tool with the same typed
  exit); either exits 3 typed, run_demo logs a SKIP with the manual steps
  (app/README.md) and NEVER converts it to a pass; the headless §7 gate is unaffected)
- path-escape (app-shell hub workspace-fs: an /fs/* path that resolves outside the
  declared workspace root — absolute, drive-qualified (incl. the drive-relative `C:x`
  form), leading separator, UNC, `..\` traversal, or symlink escape (resolve() runs
  BEFORE the commonpath check, so a link cannot smuggle a target). Refused 403 +
  probed hub.fs.rejected; full matrix (list × read × write) in hub/test_hub.py Test11)
- workspace-not-open (app-shell hub workspace-fs: /workspace or /fs/* before any
  workspace root was DECLARED — serve_app startup and POST /analyze declare it via
  HubServer.set_workspace, the hub never infers a filesystem jail from a pipeline
  run. 503 typed, probed hub.fs.rejected)
- fs-io-error (app-shell hub workspace-fs: missing/non-directory/unreadable/
  unwritable targets, and binary (non-utf-8) reads — utf-8 files only this round,
  APP-SHELL-CONTRACT — refused with the reason in detail, never a fabricated
  listing or a misrepresented body; probed hub.fs.rejected)
- analyze-session-detached-log (app-shell BOUND, logged not raised: POST /analyze now
  runs the outer wall's analyze_session (hub/server.py run_outerwall_session — the
  factored serve_app attach pattern) so the analysis is recomputed + re-attached on
  the SAME pipeline; analyze_session keeps its own hub log, so that run's pipeline
  probes live on session["pipeline"]["log"], NOT on the serving hub's stream. The
  serving log records the bound + the session's event count on hub.analyze.reattach
  — never silent. Corollary, logged on hub.analyze.accepted: the outer wall owns the
  REAL V1 capability feed, so a capability_fn injected via set_capability_fn is not
  consulted by /analyze re-runs (it remains live for direct run_pipeline callers))

- fs-shape-mismatch (app shell: a 200 body from any workspace-fs endpoint (/workspace,
  /fs/list, /fs/file, /fs/roots-candidates) off the APP-SHELL-CONTRACT shape is refused
  WHOLE by app/src/fsSource.ts — never a partial accept; the hub's own typed refusals
  (path-escape · workspace-not-open · fs-io-error — HUB-workspace-fs lands + probes the
  server legs) pass through VERBATIM and render as NAMED banners in the shell, tested by
  app/test/shell.units.test.ts + the path-escape banner leg in shell.face.test.tsx)
- save-refused (app shell: Ctrl+S / File > Save against a tab that cannot be written —
  e.g. the DECLARED bundled-fixture fallback tab that stands when a hub without the
  workspace-fs endpoints backs the editor — is a probed (shell.save.blocked), bannered
  refusal; never a silent no-write, never a fake "saved")

## Acceptance inputs (Phase 3 / §7)
1. **Python moat case** (rich path): small package with an unused function — real measured
   capability (V1), real pyright resolution, unused flagged by composed-graph gap analysis.
2. **Lean file** (honest-ceiling path): G-tier dock → leads only → renders unknown/dashed,
   OUTLINE unknown — proving unknown never becomes green through three membranes.
