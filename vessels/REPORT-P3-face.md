# REPORT — P3-face: the human face (browsable app) + AI server

Date: 2026-07-20 · Assembly: `A:\30lean-push\proofgraph` · Agent: P3-face
Cells modified: **NONE** (packages/* byte-untouched; hub edits ADDITIVE only, suite re-run green).

## What was laid

| Piece | Path | Role |
| --- | --- | --- |
| Vite app | `app/index.html`, `app/src/{main,App,EditorPane,AiPanel}.tsx`, `app/src/styles.css`, `app/vite.config.ts` | split view: editor pane + graph pane + AI panel + verdict legend; port 5199 strictPort |
| Analysis feeding tube | `app/src/analysisSource.ts` | GET /analysis per OUTERWALL-CONTRACT; pending-vs-refusal honesty; id-safe verdict overlay |
| LSP transport | `app/src/lspTransport.ts` | faithful browser port of V2's connectTransports (credited; single declared initialize enrichment, logged) |
| AI server | `ai/server.ts` | zero-dep node:http, port 8478, POST /ask wrapping the V6 outlet; FAKE transport default; keys ONLY in this process |
| Hub launcher | `hub/serve_app.py` (additive) | fixed ports (HTTP 8477, WS 8479), moatpkg fixture, `--pyright live`, `--lsp live` (V2's exact wiring incl. the silent-tier-upgrade guard) |
| Hub additive edits | `hub/server.py` | `start(http_port=0, ws_port=0)` params (defaults unchanged) + `Access-Control-Allow-Origin: *` on HTTP responses (diagnostic/graph data only, no credentials) — hub suite re-run **34/34** |
| Tests | `app/test/p3.face.test.tsx` (10 + 1 todo), `app/test/p3.build.gate.test.ts` (1), `ai/test/p3.server.test.ts` (6) | see below |
| Docs | `app/README.md`, seam-catalog growth in `ARCHITECTURE-PHASE2.md` | run instructions (hub 8477 → ai 8478 → vite 5199) + new named classes |

Wiring is reuse, credited: V4's `graphSource` (byte-gated /graph, now also
classifying injected-transport death as `hub-unreachable` — additive edit),
V5's `busAdapter` verbatim (its suite untouched, still 9/9), V2's WS
transport pattern, V6's outlet + cell 6's own testkit fake transport, cell
4's demo Monaco wiring, cell 5's own jsdom shims (credited in the test).

## Suites (all green, end state)

- `app`: `npx vitest run` → **28 passed + 1 todo** across 4 files
  (v4.serve 8 — undisturbed; v5.bus 9 — undisturbed; p3.face 10 + 1 todo;
  p3.build.gate 1 = `npx vite build` + bundle secret scan, ~26 s).
  `npx tsc --noEmit` clean.
- `ai`: `npm test` → **14/14** (V6's 8 undisturbed + 6 new).
- `hub`: `python hub/test_hub.py` → **34/34** after the additive edits.
- No cell package touched; no cell suite invalidated (v4/v5 re-runs execute
  both TS cells' sources in-process and stayed green).

## LIVE browser proof (manual path exercised this session)

`python hub/serve_app.py` + `node ai/server.ts` + `npm run dev`, then
localhost:5199 in a real browser:

- editor pane: real Monaco on `moatpkg/core.py`, status line honest:
  `tier: G · transport: stub-tier-G … no live diagnostics are claimed`
  (hub ran without `--lsp live`; the MEASURED-tier path reads
  `capability.wall.construct` verbatim and rides the hub WS when armed);
- graph pane: 6 nodes · 1 edge · 2 dashed leads; `/analysis` →
  `no-analysis-computed` rendered as a PENDING banner; every outline
  not-yet-computed grey, never green;
- brushing LIVE: `clickNode(n_808f977d47f6c28f)` on the graph wall → editor
  busLog carries `{type:"node.select", origin:"graph", nodeId}` byte-identical
  → `editor.select.recv.reveal {revealed:"center", highlightApplied:true,
  monacoRange lines 6–7}` (the real `def main` span) × T5's `link.select.out`
  pin — pins on BOTH sides of the joined bus, in the browser;
- AI panel: default question → answer names the REAL unused ids
  (`n_0b636277e755222b` moatpkg.helpers.unused_fn, …) and the panel renders
  the `outlet.tool.exec` payloads — WHICH graph facts the answer used —
  with the FAKE transport labelled loudly.

## Honest ceiling in the UI (proven, not styled)

- unknown fill → hatched grey chip, never `#2E7D32` (pin-verified in
  p3.face via `dump().paints` + `verdict.fill.unknownGuard`);
- `outline: null` → not-yet-computed grey (T4/T5's own branch, NOT
  overridden; asserted `outlineWasNull:true` for the whole served envelope);
- unrecognized worstOf token → ranks WORST, renders unknown (canonical
  `worstOfVerdict`, `unrecognizedTokens` pin read);
- paints asserted against the CANONICAL `WORST_TO_STATUS`/`worstOfVerdict`
  from `packages/schema/gen` — no local tables in any assertion path;
- leads render `leadEdge` dashed (`render.edge.leadGuard` pin), never edges.

## Key custody (three proofs, all automated)

1. **outlet scrub (guard 1)** through the server: api key planted in graph
   data → response carries `REDACTED-BY-OUTLET`, never the raw key.
2. **response gate (guard 2)**: masterSecret planted in graph data (the
   outlet cannot know the vault secret) → the WHOLE payload is refused,
   500 typed `key-leak`, secret absent from the refusal — the gate's firing
   path is proven end-to-end, not eyeballed.
3. **bundle scan**: `p3.build.gate.test.ts` greps every built dist file for
   the ai-server masterSecret + FAKE key literals (live-extracted from
   `ai/server.ts` so renames cannot rot the scan), cell 6's dev default, and
   the `sk-ant-api03`/`sk-fake` families → zero hits, build-failing.

## Bounds logged (no silent caps)

1. **span-file remap** (editor pane): extractor `span.file` is source-root
   relative; the pane remaps it to the open document's pyright-canonical uri
   for exactly the open file's nodes. IDs + byte spans untouched (the V5
   shared-universe move, declared in code + README).
2. **one open document** this round: `core.py`; helpers nodes render in the
   graph only.
3. **stub floor tier G** when no measured capability stream is aggregated:
   cell 4's own stub transport, zero diagnostics served, declared in the
   status line. Unknown never upgrades — the app never asserts a tier.
4. **FAKE transport labels itself** in every answer; tool execution + ids are
   real hub data even in FAKE mode; `--live` documented, out of demo path
   (`ai-live-key-missing` typed if attempted without a key).
5. **fresh same-snapshot pair per /ask** (hub /graph + /query) — a torn read
   is the outlet's `graph-data-stale`, surfaced 409 typed, never re-answered.
6. **react dedupe**: cell sources run against the app's single React 18.3.1
   (`resolve.dedupe`) — the two-instance hooks-dispatcher failure is
   documented in vite/vitest configs.
7. **hub WS port ≠ 8477**: stdlib http.server cannot upgrade; WS listens on
   8479 and the app discovers it via `/health.lsp.url` (the contract's "hub
   8477" is the HTTP surface; documented in README + serve_app).
8. **installs logged**: `monaco-editor@0.52.2` (byte-equal cell 4's lock),
   `@fontsource/jetbrains-mono@5.2.8` (pinned to cell 4's exact version) into
   `app/` only. `.claude/launch.json` added for the dev-server harness.
9. **/analysis integration is PENDING** (`test.todo` in p3.face) — component
   tests mock the contract shape; the live assertion belongs to
   `acceptance/run_demo.py`. Never faked green: this session's live run
   showed the real `no-analysis-computed` pending banner.

## Failure classes (seam catalog extended in ARCHITECTURE-PHASE2.md, rebased)

NEW: `analysis-shape-mismatch` · `analysis-graph-mismatch` ·
`ai-bad-request` · `ai-live-key-missing` · `ai-server-unreachable` ·
the response-gate leg of `key-leak`. Exercised verbatim passthroughs:
`no-analysis-computed`, `no-graph-ingested`, `unknown-endpoint`,
`pipeline-busy`, `roots-undeclared` (honest no-claim through the AI panel),
`hub-unreachable` (named banner, never a blank).

## Blocked / deferred (none required a cell change)

- No cell change was needed anywhere.
- Editor→graph caret brushing was proven headless by V5 (9/9, re-run) and
  graph→editor was additionally proven LIVE in the browser this session;
  the caret-direction live spot-check is left to the acceptance runner's
  browser pass (it owns the §7 editor-selection hop of the V4 trace).