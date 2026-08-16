# Pre-GitHub review — consolidated findings ledger

> **Historical evidence note.** This ledger quotes evidence verbatim from finder
> agents that ran on the build machine (Windows / user `Sidd_` / drive `A:\`).
> Any `Sidd_` or `A:\...\...` tokens below are **historical build-machine paths
> reproduced from finder output** for auditability. They are not runtime inputs,
> and none of them exist on a clone. See `README.md` "Repository scope" and
> `INTEGRATION-MANIFEST.json` `_repoNote` for the full provenance framing.

*9 finder agents (efficiency · altitude · reuse/duplication · docs-vs-code · language-pitfall
· wrapper/shim · simplification · line-by-line servers · cross-package seam) produced ~66 raw
findings. Deduplicated to ~55 unique below, classified and severity-ranked. Overlap where
finders converged is noted — convergence raises confidence. Each row's fix approach is the
plan for the fix wave; declared-limitation rows are marked NO-FIX (documented design bounds,
not defects).*

Severity key: **P0** push-blocking / security · **P1** real bug, user-visible · **P2**
robustness/latent · **P3** hygiene/dedup/dead · **DECLARED** = already an owned limitation.

---

## Cluster S — Security (P0, push-gating)

| id | file | finding | fix |
|----|------|---------|-----|
| S1 | hub/server_http.py:69 | `Access-Control-Allow-Origin: *` + OPTIONS whitelists PUT/POST with no Origin/Host check → any website can PUT /fs/file (overwrite workspace) or POST /analyze on the localhost hub | localhost origin allowlist (127.0.0.1:5199 + configured), drop wildcard, reject cross-origin state-changing verbs; test both directions |
| S2 | ai/server/core.ts:90 | same wildcard on the key-holding ai server → any page can drive POST /ask | same allowlist; test |

## Cluster R — Re-analyze / workspace-root family (P1, the UI-can't-drive-it bug; finders 8+9 converge)

| id | file | finding | fix |
|----|------|---------|-----|
| R1 | hub/serve_app.py:126 | declares PARENT as workspace but extracts the package dir; spans mint `core.py`, so every UI re-analyze re-declares stale node-id roots into a parent-rooted re-extraction → `unknown-root`; also disagrees with server_analyze's jail. Stale comment describes retired staging | make serve_app's workspace root == the extraction root (the package dir); align with server_analyze; re-verify roots-candidates ↔ analyze id namespace |
| R2 | app/src/useAppFlows.ts:69 | re-analyze sends `prefs.pyrightMode` (default none) not served `workspace.pyrightMode` → silently downgrades a `--pyright live` hub | read pyrightMode back from workspace (as it already does package) |
| R3 | app/src/useFileFlows.ts:75 | Open Folder re-declares workspace root but keeps tabs on old relPaths → next save 404s or hits wrong file | invalidate/remap open tabs on workspace change |

## Cluster D — Diagnostic-truth (P1, closest to the project's soul; finder 6+9)

| id | file | finding | fix |
|----|------|---------|-----|
| D1 | outerwall/analyze_capability.py:43 | `WallPins` is a static shim over module-global last-run state → with python+lean both measured, every language key gets the SECOND run's stream; capability provenance misattributed | bind pins to the wall instance's own bus (self._bus), not the module global; snapshot per-wall |
| D2 | hub/serve_app.py:159 | attached capability pins go stale after a POST /analyze re-runs+shuts its own feed → /pins serves a dead session as the live backend's | refresh/detach attached pins on re-analyze, or attach the instance bus |
| D3 | outerwall/system_pins.py:119 | probeCatalog() lists capability ids that tap() then rejects as uncatalogued | route capability.* in tap() (snapshot-only) or drop from catalog with a reason |
| D4 | outerwall/gap.py:96 | `cycles.extractorT3` is always `{}` — the extractor T3 stage only runs `if cfg.roots`, and no caller ever passes extractor roots; the "module cycles surface verbatim" promise is structurally uncovered | thread roots into extractor config, or correct the doc-claim to name the real coverage (model-wall sccs) and mark the decl-universe gap honestly |
| D5 | app/src/dialogInfo.tsx:146 | Gap dialog `String()`s structured blindSpots → renders `[object Object]` | render the `{source, blindSpots|payload}` shape |

## Cluster W — Wire / correctness (P1/P2; multi-finder)

| id | file | finding | fix |
|----|------|---------|-----|
| W1 | byok-arena/src/adapters/gemini/wire.ts:35 | reshapeMessages puts tool call-id in `functionResponse.name` AND drops the paired assistant `functionCall` → any 2nd tool round on replayed history degrades/400s (finders 2+claim-audit; CONFIRMED real, not just unreached) | name←functionName, id←toolCallId; keep the functionCall part; wire-shape test |
| W2 | ai/server/askroute.ts:32 | `bodyText += buffer` decodes each chunk → multibyte char split across chunks → U+FFFD | `req.setEncoding('utf8')` or Buffer.concat then decode |
| W3 | byok-arena/src/arena/compare.ts:36 | `deepEqual` = JSON.stringify equality, key-order sensitive → two providers' identical args in different key order → false "normalization DIVERGES" | order-insensitive deep compare |
| W4 | ai/outlet/ask.ts:99 | maxTokens honored on chat leg, dropped on submitToolResults continuation (hardcoded 1024) with no probe → silent truncation of the user-visible answer | thread maxTokens into WallSubmitRequest + all 3 continuations; probe on default |
| W5 | ai/server/hub.ts:52 | `/graph` + `/query` are 2 uncoordinated fetches; content-derived ids defeat the stale gate → AI can answer from a torn snapshot | a coherence token / single snapshot endpoint, or fetch analysis+graph as one |
| W6 | app/src/lspTransport.ts:60 | initialize enrichment only applied when `params.capabilities` truthy → a capabilities-less initialize crosses unenriched AND unlogged → pyright gates diagnostics silently | enrich (creating capabilities if absent) always; log every initialize decision |
| W7 | outerwall/analyze_roots.py:101 | module-ID root branch expands empty→`[]` silently (proceeds undeclared) while the module-NAME branch raises unknown-root | one shared expand-members helper carrying the empty guard |
| W8 | capability-layer/capability/spine_proto.py:86 | didChange hardcodes version 2; probe battery bakes the constant into its assertions | per-uri monotonic counter in self.docs; update the battery waits |

## Cluster H — Robustness / process hygiene (P2; language-pitfall + servers)

| id | file | finding | fix |
|----|------|---------|-----|
| H1 | hub/server_ws.py:115 | bridge loop `except Exception: pass` swallows backend.start()/frame errors incl. json.loads on a malformed frame → session dies with no named class (3 finder sightings; violates loud-failure contract) | catch → emit a named class (lsp-bridge-error/lsp-backend-dead) → then close |
| H2 | hub/server_http_get.py:120 | `/pins/history?limit=abc` bare `int()` ValueError escapes do_GET (catches only BrokenPipeError) → traceback + dropped conn instead of typed hub-bad-request (2 sightings) | validate limit → typed 400 |
| H3 | ai/server/askroute.ts:31 | no `req.on('error')` + no body-size cap → mid-body socket reset = uncaughtException crash of the key process | add error listener + body cap |
| H4 | run_all_suites.py:141 | suite timeout kills only cmd.exe → orphaned node tree holds stdout handle → communicate() can hang the runner forever (the codebase's own orphaned-subprocess-tree class, unmitigated here) | taskkill /T on timeout (reuse kill_tree) |
| H5 | acceptance/checks/common.py:118 | run_node timeout orphans headless Chromium; kill_tree() exists 15 lines up, unused on the timeout path | apply kill_tree on TimeoutExpired |
| H6 | acceptance/checks/ui_servers.py:34 | ai server pipes not drained after ready line → >64KB post-startup output deadlocks it | drain in a thread / DEVNULL after ready |
| H7 | hub/server_ws.py:67 | closed LSP sessions/backends never evicted; frame ledgers + HubLog append-only → unbounded hub RSS | evict on close (keep counts+digest); ring-buffer HubLog |
| H8 | outerwall/analyze_roots.py:30 | single-file staging `mkdtemp()` never removed → temp-dir leak per single-file analyze | TemporaryDirectory / cleanup registry |
| H9 | hub/server_analyze.py:86 | pipeline swap + attach + set_workspace non-atomic; GET /graph & /analysis unguarded by the lock → new graph + old analysis observable | do the swap+attach under the lock; readers take it |
| H10 | hub/server_ws.py:66 | busy flag set before the try/finally that clears it → an exception in session setup bricks the single-instance backend permanently (lsp-backend-busy forever) | set busy inside the try, or widen finally |
| H11 | vessels/v1_feed.py:30 | capability_fn serves cached handles with no `_down` check; shutdown() doesn't invalidate → dead measured-handles handed out after shutdown | guard capability_fn on _down; clear caches on shutdown |

## Cluster U — Duplication / drift (P1 for U1, else P3; reuse + altitude)

| id | file | finding | fix |
|----|------|---------|-----|
| U1 | packages/graph-model/schema/graph-schema.ts | **ALREADY DRIFTED 119 lines** from canonical gen/graph-schema.ts (no SCHEMA_REVISION/OUTLINE_WORST_ORDER/worstOfVerdict), and NOTHING gates it — the v0.1 amendment silently never landed here. This is the "two schemas" STOP condition | regenerate from the amended schema.json OR re-export canonical + a byte-sync gate (as ids.py has); this is P1 integrity |
| U2 | graph-model/src/ids.py + extractor/schema_ids.py | ID mint in 3 Python copies (canonical + graph-model original still-imported + extractor's diverged copy) | consolidate to packages/schema import where the gate allows; else keep byte-sync gates and document |
| U3 | hub/pipeline_paths.py + 2 wall_pin.py | PIN check re-implemented 4× (one hand-inlines canonical_json) | import packages/schema/pin.py |
| U4/U8 | capability shim/ybg_state.py + spine_wire.py + extractor pyright_common + app uris.ts | path_to_uri / pyright URI canonicalization 4 sites, ALREADY drifted (shim missing the V1 lowercase-drive fix) | one shared helper per language; fix the drifted shim |
| U5 | editor-shell/src/schema/{schema,pin}.ts | byte-copies of canonical (cites tsconfig rootDir; graph-view proves direct import works) | direct re-export like graph-view, or keep the sync test (documented) |
| U6 | app/src/appCore.ts + ai/server/config.ts + configs | dev ports as independent literals in 7 files | single source (a ports module / env), consumed everywhere |
| U7 | capability-layer/capability/schema.py:60 | worst_case_order() hand-typed 4th copy of the frozen vocabulary | read gen/schema_constants.OUTLINE_WORST_ORDER (as outerwall does) |
| U9 | app/src/editorPaneKit.ts:127 | languageId "python" hardcoded in live+stub handles; uris.ts doesn't know .lean | derive languageId from the open file / hub capability stream |
| U10 | app/src/uris.ts:37 | spanFileMatches basename-suffix match → 2 same-named files project onto the wrong tab | remap once at the layer that knows the workspace-relative root |

## Cluster E — Efficiency (P2 where non-declared; finder 1)

| id | file | finding | fix |
|----|------|---------|-----|
| E1 | outerwall/analyze_run.py:103 | full ingest verification runs 3× per analyze | thread roots into ingest #1; single final verify |
| E2 | outerwall/outline.py:83 | ruling-8 closure runs rustworkx AND python networkx BFS per-node → O(V·(V+E))×2 | one bottom-up pass over condensation + aggregate-fingerprint crosscheck |
| E3 | extractor/docks/base.py:137 | innermost_owner/node_at linear-scan all nodes per anchor → O(anchors×nodes) | per-file sorted span index + bisect |
| E4 | hub/server.py:139 | GET /graph re-serializes+reparses+resorts every request | cache (payload,counts) per graph version; invalidate on attach |
| E5 | — | duplicated pyright subprocess under V1 | **DECLARED** (bound; optional: consume cell2 handle) |
| E6 | — | sequential per-file lean driver | **DECLARED** (single-file bound; optional: thread pool) |
| E7 | — | sequential suites in run_all | **DECLARED** (clean-state policy; optional: bounded pool) |

## Cluster L — Simplification / dead surface (P3; finder 7)

| id | file | finding | fix |
|----|------|---------|-----|
| L1 | hub/*.py ×14 | unreachable package-style import branch (hub has no __init__.py) maintained twice per file | keep only the flat import (or add __init__.py) |
| L2 | hub/server_http_get.py:24 | dead QUERY_KINDS constant (re-exported twice, consulted nowhere; dup of wall's) | delete + its 2 re-exports |
| L3 | editor-shell/src/util/sha256.ts:69 | dead export sha256HexOfString | delete |
| L4 | app/src/analysisSource.ts:40 | dead ANALYSIS_SOURCE_VERSION | delete or wire into the probe |
| L5 | app/src/tabsStore.ts:91 | TabState.dirty stored + derivable → desync trap for the unsaved-close guard | derive isDirty(t) |

## Cluster G — Repo scaffolding / push-gating (P0; finders 4+7)

| id | finding | fix |
|----|---------|-----|
| G1 | no requirements.txt/pyproject → fresh clone ModuleNotFounds immediately | add requirements.txt (rustworkx, networkx, grimp, tree-sitter, tree-sitter-language-pack, pytest, websockets) + a README install step |
| G2 | no .gitignore → first push ships ~515MB node_modules + __pycache__ + regenerated artifacts | write .gitignore (node_modules, __pycache__, dist, .vite, .lake, out/, .pytest_cache, .testtmp, acceptance/evidence, acceptance/browser, per-run analysis-*.json/TRACE if regenerable) |
| G3 | PII in committed acceptance JSON (username Sidd_, A:\ paths) | scrub to relative/placeholder paths or gitignore + regenerate; ensure none in tracked files |
| G4 | ../agentic-convos and A:\2..26lean-push references break off-machine (README + INTEGRATION-MANIFEST) | rewrite as "build-machine provenance (not in repo)"; keep hashes as historical record |
| G5 | OUTERWALL-CONTRACT "hub 8477 (HTTP+WS)" wrong — WS is 8479 | correct to HTTP 8477 / WS 8479 (discovered via /health) |
| G6 | outerwall/README documents `run_demo --full` (now `--suites`) | fix the flag name |
| G7 | SYSTEM-EXPLAINED app/README line count 231 (now 252) | regenerate the Part-III/IV tables (already stale-prone; note as generated) |
| G8 | 9 session transcripts + .claude/ would ship (leak local paths, UUIDs, sibling drives) | **DECISION (default taken): exclude** agentic-convos/ (all 6 locations) + .claude/ via .gitignore; durable content already lives in README/SYSTEM-EXPLAINED/vessels reports. Reversible if you want them scrubbed-and-shipped instead |
| G9 | app/dist 11MB committed (2 stale build generations) | delete + gitignore (build gate rebuilds it) |
| G10 | graph-model/out/ stale committed with A:\ paths | delete + gitignore (run_pipeline regenerates) |

---

## Fix-wave order (each wave: fix → touched suites green → log; pause-safe between waves)

1. **Wave A (P0):** S1 S2 · U1 · G1–G10 — security + the schema-drift integrity blocker + all repo scaffolding. After A the tree is *pushable*.
2. **Wave B (P1):** R1 R2 R3 · D1 D2 D3 D4 D5 · W1 W7 — the UI-broken and diagnostic-truth bugs. After B the app *works* end to end.
3. **Wave C (P1/P2):** W2 W3 W4 W5 W6 W8 · H1–H11 — wire correctness + process robustness.
4. **Wave D (P3):** U2–U10 · L1–L5 · E1–E4 — dedup, dead surface, non-declared efficiency.
5. **Design lenses (read-only, after fixes):** design-critique + ux-copy on the app, system-design sanity, /doctor env health → punch-list appended here.
6. **Repo:** git init + .gitignore verified + first commit; THEN /code-review ultra (cloud) becomes available as the final gate.

Declared limitations (E5 E6 E7 + the 7 in REMEDIATION-REPORT §4) are NOT fixed — they stay
documented bounds. Anything a fix can't do truthfully becomes a declared limitation, not a
silent change.

---

# Post-fix status — Waves A/B/C/D all landed (2026-08-16)

Every P0 and P1 finding is closed; declared limitations remain declared. Gate: the tree
was 19/19 (852.5s Wave B, 904.8s Wave C). Wave D's own re-runs are green on every touched
suite (hub 58→59, ai 21, app 121+1, structure-extractor 140/140 in 66s down from 69s,
outerwall 46→47 in 79s down from 86s — measured perf wins from E1/E2/E3).

**Deliberately left as documented residuals (agent-audited, not defects):**
- U2, U5, U6, U10: already-gated by tests or already-resolved-elsewhere-by-earlier-wave,
  each with a note in the D-dedup agent's report.
- W5 hub-monotonic: mitigated by `Promise.all` concurrent fetch; the deterministic
  fix crosses the R partition — recorded as a blocked follow-up in the transcript.

---

# Lens findings (post-Wave-D punch-list — read-only reports, not fixes)

The four read-only lens agents ran across the fixed tree and returned this consolidated
punch-list. Everything below is FUTURE work suggested for the next round, not shipping
blockers unless marked P0.

## /doctor (env / repo health)

| id | severity | file | finding |
|----|----------|------|---------|
| DOC-1 | **P0 for GitHub push** | (repo root) | **No LICENSE file at the repo root.** Only `packages/editor-shell/package.json` declares MIT; the other five package.jsons carry none. Every public GitHub repo needs a top-level LICENSE. Recommendation: MIT or Apache-2.0 at the root (Apache-2.0 aligns with elkjs EPL-2.0 already declared in the license gate; MIT is the simplest match to the one existing package). ADD BEFORE PUSH. |
| DOC-2 | P2 | packages/capability-layer/capability/capability.py:28 | `_lake_exe()` hardcodes `A:\lean\elan\bin\lake.exe` as its `shutil.which("lake")` fallback — a build-machine drive path that will break on any other machine when lake isn't on PATH. Drop the fallback or make it an env-var. |
| DOC-3 | P2 | (multiple package.json files) | README declares `Node ≥ 24` as a prerequisite but no `package.json` carries `"engines": {"node": ">=24"}`. Add engines to the 3 packages that build under Node (app, ai, packages/editor-shell, packages/graph-view, packages/byok-arena). |
| DOC-4 | P3 | (repo root) | No pyproject.toml / setup.cfg — a pip-installable package would need it eventually. Not urgent. |
| DOC-5..8 | P3 | (various) | Machine-absolute paths inside audit reports (already fronted by build-machine provenance notes per G4); enumerated for the ledger, no action required. |

## engineering:system-design (architecture)

| id | severity | file | finding |
|----|----------|------|---------|
| SD-1 | P1 | hub/server*.py | `_capability_fn` + `set_capability_fn` on HubServer are documented as "V1 plugs the real thing here" but nothing actually calls them any more (analyze() owns capability wiring). Dead extension point misrepresenting itself as active. Either wire it, remove it, or mark it explicitly reserved. |
| SD-2 | P2 | hub/server_analyze.py | `_state_swap_lock` (H9's atomicity lock) is lazily materialized inside `AnalyzeMixin.analyze()` with a comment noting the partition; move it to `server_core.py`'s `__init__` where the other locks live. |
| SD-3 | P2 | hub/pipeline_log.py | The `analyze-session-detached-log` bound is declared and counted on `hub.analyze.reattach` but never healed — each POST /analyze creates a fresh session hub log whose events don't reach `/pins/history`. Consider merging session logs on reattach. |
| SD-4 | P2 | hub/serve_app.py + hub/server_analyze.py | The workspace-declaration logic (`ws_root = fixture.parent if is_file else fixture`) is duplicated between the two files (R1's Wave-B fix). Consolidate to one helper. |
| SD-5 | P2 | outerwall/analyze_capability.py:43 | `snapshot_streams` reads `feed._walls.items()` — a private attribute across the vessel boundary. Add a proper accessor to V1CapabilityFeed. |
| SD-6 | P3 | hub/ | The hub has grown to ~34 files, ~4.5k lines, 8-mixin HubServer composition — it's a mini-cell without a MEMBRANE-SPEC.md. Consider adding one for future-you. |
| SD-7 | P3 | outerwall/system_pins.py | Two-level tap catalogue (live-tappable vs snapshot-only capability.*) works but is subtle; document it. |
| SD-8 | P3 | (multiple) | Several files sit at the linegate ceiling (run_all_suites.py 200/200, serve_app.py 194, server_ws.py 194) — proactive splits before the next bug fix bumps one over. |

## design:design-critique (app)

| id | severity | file | finding |
|----|----------|------|---------|
| DC-1 | P2 | app/src/BottomDock.tsx (DiagnosticsList) | Diagnostics rows are static text; the handoff spec explicitly makes them clickable to reveal in the editor at the line. |
| DC-2 | P2 | app/src/AppMain.tsx | The AI window's label is rendered TWICE (tool-window title bar + internal AI panel header). |
| DC-3 | P2 | app/src/AppMain.tsx:85-94 | The zoom cluster shows `− · % · + · ⤢` but both `−`/`+` are permanently disabled with a "cell owns its viewport" tooltip — two-thirds of the cluster is dead. Either wire it or drop the disabled buttons. |
| DC-4 | P2 | app/src/AppMain.tsx:77-83 | The stats pill fuses graph counts and tool-window onboarding into one string ("… — drag window titles · drop on an edge zone to dock · gear menu for view modes"). Separate the tutorial into a dismissable first-run hint. |
| DC-5..7 | P3 | (various) | Legacy `BottomDock.tsx` still exported as rollback hedge; Explorer emits a `dock-title` that panes.css hides via `display:none`; `Ctrl+Shift+G` bound but never surfaced in any tooltip/menu. |

## ux-copy (user-facing strings)

| id | severity | finding |
|----|----------|---------|
| UXC1 | **P1** | The "workspace unavailable" reason is worded FOUR different ways for the same underlying condition across header/banner/status/tooltip. Unify. |
| UXC2 | **P1** | Stats-pill string fuses graph counts with an onboarding tutorial (see DC-4); separate them. |
| UXC3 | P2 | The "no recents yet" empty-state exposes the storage key three times (`localStorage pgshell.recents.v1`). Internal detail leaking to the user. |
| UXC4 | P2 | The honest-ceiling / no-live-diagnostics story is told with three competing metaphors — "stub floor at tier G", "grammar floor", "honest ceiling". Pick one. |
| UXC5 | P2 | AI-panel error banner uses different structure than the main banner region (flat string vs `<b>class</b>: detail`). |
| UXC6 | P2 | Welcome-screen version line greets first-timers with `schema v0/3f312369… (GET /health)` — internal detail before the user knows what any of it means. |
| UXC7 | P2 | Menu tooltips carry contract-language ("pipeline-busy is the hub's own refusal too") aimed at a maintainer, not a user. |
| UXC8 | P3 | The five tool windows carry inconsistent labels across rail/window-title/menu (e.g. "Project tool window" vs "Project"). |

Everything above is READ-ONLY. Each finding names its file and a concrete recommendation.
The P0 (DOC-1: LICENSE file) is the only push-blocker; the two P1s are UX polish worth
doing before public eyes see it but not gating.
