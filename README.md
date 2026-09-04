# ProofGraph

ProofGraph turns source — code **and** documents — into a schema-conformant
proof-dependency graph whose verdicts are honest: a node is **green only when a
real checker proved it** (today: the Lean 4 kernel, trustLevel 0), everything
unproven says so in a typed, probed way, and every declared limitation rides in
the output rather than being papered over. It is an assembly of six
independently-built cells (three Python analysis cells, three TypeScript UI
cells) around one frozen canonical schema, composed through per-cell walls,
wall-to-wall vessels, a backend hub, and an outer wall (`analyze()`), with a
browser app and an AI outlet as faces. Every source file is ≤200 lines
(gate-enforced), was read whole in an adversarial claim audit, and carries a
verified one-line purpose in [`audit/`](audit/AUDIT-SUMMARY.md) — this README
is built bottom-up from that verified material.

**State of record**: the clean-state command `python run_all_suites.py` = 19/19
suites PASS (verbatim table: [REMEDIATION-REPORT.md](REMEDIATION-REPORT.md) §3,
2026-08-03).

---

## Architecture — cells → walls → vessels → outer wall → faces

### One schema, shared by all cells

[`packages/schema/`](packages/schema/README.md) is the single source of truth:
`schema.json` (Frozen Schema v0, rev v0.1) + `capability.json` (the depth-tier
seam) are the only hand-edited sources; `gen/*` + `PIN` are byte-regenerable
projections. Every cell imports this package; every wall asserts the canonical
PIN at construction. Suite: 23 py + 14 ts, `schemagen.py --check` keeps the 8
generated artifacts in sync.

### The six cells (each an independent package with its own wall, probes, suite)

| Cell | Package | What it does (verified) | Suite (live baseline) |
|---|---|---|---|
| 1 | [`packages/graph-model/`](packages/graph-model/README.md) | Schema-owning cell: 8-stage pipeline over content-addressed IDs, rustworkx reachability cross-checked vs NetworkX, byte-exact text→model→text round-trip gate; Phase-1 wall adds 12 `graph-model.wall.*` leads | 113 |
| 2 | [`packages/capability-layer/`](packages/capability-layer/README.md) | Measures what a language toolchain honestly delivers (A–J pipeline + P0–P11 battery) and stamps the *measured* depth tier — CT is unreachable without a real P2 pass | 131 (live pyright + lean) |
| 3 | [`packages/structure-extractor/`](packages/structure-extractor/README.md) | Source → schema-conformant graph: T1 nodes via tree-sitter (7 languages), T2 resolved edges via per-language docks — including the live Lean kernel driver — T3 properties via rustworkx | 140 (full live) |
| 4 | [`packages/editor-shell/`](packages/editor-shell/README.md) | Monaco text projection: FILL verdict gutter, OUTLINE trust-base ring, brushing/linking over a shared bus of `Node.id`s; guard: green-may-never-be-faked | 96 + import gate |
| 5 | [`packages/graph-view/`](packages/graph-view/README.md) | Renders the envelope through a probed S0–S7 pipeline; unknown paints hatched grey, never green; edge-id multiset equality enforced through layout | 152 + tsc |
| 6 | [`packages/byok-arena/`](packages/byok-arena/README.md) | One uniform ModelAdapter over Anthropic/OpenAI/Gemini on the user's own vaulted key, cost meter, and the two-provider agreement arena | 103 |

Each cell was built independently, then vendored into this assembly as a copy.
The originals were read-only inputs on the **build machine** (sibling
working trees, not part of this repository); their per-package origins and
sha256 tree hashes are preserved as a historical integrity record in
[INTEGRATION-MANIFEST.json](INTEGRATION-MANIFEST.json). Every deviation of a
copy from its origin is a labelled change logged in the owning package's
`ASSEMBLY-CHANGES.md` (which ships). The raw build/session transcripts are
deliberately excluded from the repo — see **Repository scope** below.

### Walls (Phase-1 membranes)

Each cell's minimal clean interface is **promoted OVER its diagnostic pins,
never replacing them** ([WALL-CONVENTIONS.md](WALL-CONVENTIONS.md), per-cell
`MEMBRANE-SPEC.md`). Every wall verifies the canonical schema PIN and refuses
with typed, cataloged failure classes ([SEAM-MAP.md](SEAM-MAP.md) maps who
consumes what).

### Vasculature: vessels + hub

- [`vessels/`](vessels/README.md) — connector suites proving the seams in one
  process: V1 capability→extractor feed (11), V2 hub WS `/lsp` bridge to a real
  pyright squiggle (4), V3 extractor→model (16), the V4 hub launcher, and
  `pathing.py` (the alias loader all Python vessels and the hub use).
- [`hub/`](hub/README.md) — the shared backend (assembly code, not a cell):
  `run_pipeline` extractorWall→modelWall, HTTP/WS servers for the app
  (`/graph`, `/analysis`, `/fs` jail, `/pins`, `/lsp` bridge, `/query`),
  `serve_app.py` dev launcher. Suite: 44 (1 documented Windows-symlink env skip).

### The outer wall

[`outerwall/`](outerwall/README.md) — `analyze` / `analyze_session` /
`system_pins` behind the frozen [OUTERWALL-CONTRACT.md](OUTERWALL-CONTRACT.md):
the hub pipeline with the real V1 capability feed, declared-root resolution
(never guessed), ruling-8 outline fill with closure crosscheck, re-ingest
through the model wall, canonical-schema validation, and gap + provenance
assembly with build-failing hole checks. Suites: 41 + 21
(`test_real_inputs.py` — sha-pinned vendored real inputs: colorama 0.4.6 and
three lean4 v4.31.0 `Init/*` files, two independent runs byte-compare equal).

### Faces

- [`app/`](app/README.md) — the browser UI: the graph-first browser shell
  (React + Monaco + React Flow) over hub data, per the
  [APP-SHELL-CONTRACT.md](APP-SHELL-CONTRACT.md) and the
  [`shell-design/`](shell-design/README.md) reference. Suite: vitest 111 + 1
  todo (incl. the P3 built-bundle secret scan) + `tsc --noEmit` clean.
- [`ai/`](ai/README.md) — the API interface: the V6 AI outlet (graph as data,
  one tool round, key-scrub invariants) + the P3 ai face server over the
  byok-arena wall. Suite: 14.
- [`acceptance/`](acceptance/README.md) — the §7 acceptance gate:
  `run_demo.py` (checks a–j + the default headless UI step) and
  `run_shell_demo.py` (the app-shell contract loop).

### Enforcement around everything

- [`faultcheck/`](faultcheck/README.md) — proves each guard actually fires:
  6 faults, each = scratch copy → control must PASS → one anchored defect →
  suite must FAIL carrying the guard's named class. 6/6 CAUGHT.
- `linegate.py` + `linegate-exemptions.json` — the sub-200 ceiling as an
  enforced invariant (exit 1 with class `line-gate-violation`; every exemption
  carries a reason). Current: 0 offenders / 727 source files.
- `run_all_suites.py` — the ONE clean-state command (below).

---

## Verdict semantics — green only from a real checker

The guard chain, each link cited and fault-tested:

1. **The kernel driver** (`packages/structure-extractor/extractor/docks/lean_driver/`,
   [README](packages/structure-extractor/extractor/docks/lean_driver/README.md)):
   `Driver.lean` runs the Lean 4 kernel at trustLevel 0;
   green = `kernelAccepted ∧ ¬usesSorry ∧ unexpectedAxioms==[]`
   (allowlist exactly propext / Classical.choice / Quot.sound; `sorryAx` is
   NEVER allowlisted). 31/31 smoke via `run_smoke.py`; 9 declared limits ride
   every output.
2. **The Lean dock tightens it** (cell 3): green additionally requires the file
   elaborated error-free — a measured false-green hazard (kernelAccepted decl
   inside a header-failed file) was closed, not declared. Kernel verdicts map
   green / sorry→amber / error→red / module→unknown; fills carry
   `origin: "checked"`, `source: "lean-kernel:v4.31.0:kernelAccepted decl=<name>
   run=<sha16>"` where `run=` resolves to the probed driver invocation.
3. **The unbacked-green guard** (cell 3, failure class `unbacked-green`) fires
   at three levels — `SchemaNode.validate`, assemble audit+raise, tier check —
   so a green without checker attestation cannot leave the extractor.
4. **The model wall** rejects arriving fakes with class `fake-green`.
5. **The view** paints unknown hatched grey, never green
   ([`packages/graph-view/src/`](packages/graph-view/src/README.md), S2).
6. **The editor** enforces `green-may-never-be-faked`; at stub tier G even
   attested greens are BLOCKED ("tier G is not compiler truth") — green renders
   only at the tier the analysis MEASURED.

Proven in both directions: acceptance check **(i)** walks one real kernel green
checker → analyze() → hub → view (`#2E7D32`) → editor gutter with the same
content-addressed `Node.id` byte-identical at every hop; check **(j)** shows a
doctored green failing at three walls, each with its named class. Fault (a) in
`faultcheck/` proves the unbacked-green guard catches a planted defect.
(Sources: [REMEDIATION-REPORT.md](REMEDIATION-REPORT.md) §1 items 1–2;
`vessels/REPORT-GREENFLOW.md`; `vessels/REPORT-LEANDOCK.md`.)

Where no checker exists, the graph says so: colorama (real Python input)
analyzes to **literally zero green** — pyright resolves, it never verifies.

---

## Install

Prerequisites: Python 3.12 / Node ≥ 24 (native TS type-stripping) /
`elan` + `lake` on PATH for the Lean path (toolchain pins: driver v4.31.0,
cell-2 repo v4.32.0 — limitation 1 below).

Tested on: Windows 11, macOS (arm64 / x86_64), Ubuntu 22.04+.

```bash
# 1. Python deps (pinned; see requirements.txt)
pip install -r requirements.txt

# 2. Per-package Node deps — the JS packages keep their OWN node_modules
#    (deliberately NOT an npm workspace: hoisting would break the cells'
#    import-boundary gates), so npm ci in each:
for d in packages/editor-shell packages/graph-view app ai; do
  (cd "$d" && npm ci)
done
```

On Windows (PowerShell), replace the loop with:
```powershell
foreach ($d in @("packages\editor-shell","packages\graph-view","app","ai")) {
  Push-Location $d; npm ci; Pop-Location
}
```

The `ai/` and `byok-arena` Node deps are zero/near-zero; `packages/byok-arena`
and `packages/schema` install with `npm ci` the same way if you run their
suites directly. No build step is needed up front — the suites and the P3
build gate compile from source (`tsc` / `vite build`) on demand.

## How to run

```
# THE one clean-state command (19 suite rows, fresh subprocesses, ephemeral ports)
python run_all_suites.py

# the acceptance demo, headless by default (11 PASS / 0 FAIL / 0 SKIP;
# 59 named DOM/a11y UI page-checks, zero pixel screenshots)
python acceptance/run_demo.py

# the app-shell contract loop (11 PASS)
python acceptance/run_shell_demo.py

# prove the guards fire (6/6 faults CAUGHT, ~9 min)
python faultcheck/run_faults.py

# the line ceiling alone
python linegate.py
```

The browsable app (three processes, fixed dev ports — full recipe and options
in [app/README.md](app/README.md)):

```
python hub/serve_app.py        # hub HTTP 8477 (WS discovered via /health.lsp.url)
node ai/server.ts              # ai face 8478 (FAKE transport by default — no real keys)
cd app && npm run dev          # vite 5199
```

---

## Repository scope — what ships, what regenerates, what is left out

- **Deliberately excluded from the repo** (via `.gitignore`): the raw
  build/session transcripts (`agentic-convos/` at the workspace root and the
  per-package `packages/*/agentic-convos/`) and the harness config (`.claude/`).
  They leak build-machine absolute paths, usernames and run UUIDs, and add no
  reproducible value — the durable narrative already lives in this README,
  [SYSTEM-EXPLAINED.md](SYSTEM-EXPLAINED.md), and the `vessels/REPORT-*.md`
  round reports (all of which ship). This is a chosen exclusion, reversible if a
  scrubbed-and-shipped transcript set is ever wanted.
- **Regenerated, never committed** (also `.gitignore`d): every `node_modules/`
  (`npm ci`), Python `__pycache__/`, all build outputs (`dist/`, `demo-dist/`,
  `.vite/`, `.lake/`, `packages/graph-model/out/`,
  `packages/structure-extractor/out/`), and the per-run acceptance artifacts
  (`acceptance/analysis-*.json`, `TRACE-full.json`, `ACCEPTANCE-REPORT.md`,
  `evidence/`, `browser/`). `python acceptance/run_demo.py` rewrites the
  analyses before any gate reads them; the app P3 gate rebuilds `app/dist` with
  `vite build`; `run_pipeline` rebuilds `packages/graph-model/out`.
- **Committed and load-bearing** (NOT ignored): `packages/schema/gen/`
  (byte-checked schema projections), all `fixtures/` and goldens/recordings,
  `package-lock.json` files, and the `audit/` claim ledgers the docs cite.

---

## The diagnostic surface (pins)

Probes are the assembly's diagnostic layer: append-only, cataloged, never
shrinking. `outerwall.system_pins` is the outermost aggregation of the five
Python-side catalogs — **422 entries measured on the moat fixture**
(25 outerwall + 40 hub + 149 structure-extractor + 116 graph-model +
92 capability-layer). The browser-side cells carry their own catalogs:
editor-shell 128, graph-view 93, byok-arena 168. The hub serves
`/pins/catalog` and pins history to the app; acceptance persists its evidence
as `acceptance/evidence/ui-*.json` and `TRACE-full.json` (the green-trace
chain). Every guard refusal in this README names a probe id or failure class
you can grep for.

---

## Declared limitations

Verbatim from [REMEDIATION-REPORT.md](REMEDIATION-REPORT.md) §4 (each with
exactly where it stands):

1. **Toolchain pin divergence** — the driver pins
   `leanprover/lean4:v4.31.0` (two measured 4.31 quirks: thmInfo async
   `TheoremVal.value` read; processHeader log union), cell-2 `lean_repo` pins
   `v4.32.0` (measured CT). Declared-not-unified; probed every CT run
   (`extractor.t2.lean.toolchain.divergence`) + on the ceiling
   (`extra.toolchainPinDivergence`). **Owed**: unify on ONE pin and re-measure
   whichever moves (re-run `run_smoke.py` for the driver, or re-run gate 17 for
   cell 2). Source: REPORT-LEANDOCK bound 1 / REPORT-GREENFLOW / REPORT-CAP-LEAN.

2. **Lean single-file scope** — the driver elaborates one file per invocation;
   multi-file lake import graphs are RECOMMENDED-UNPROVEN (`lake env lean --run`
   per file after `lake build`, no scratch lake project built this round).
   Rides every output as `honestCeilings.lean.driverLimits[0]`. Source:
   REPORT-LEAN-DRIVER-SPIKE "Answers for the NEXT round" #1; REPORT-LEANDOCK
   bound 2.

3. **Browser editor gutter at stub tier G shows blocked-greens** — with no
   measured capability stream aggregated on the ephemeral hubs, the browser
   editor mounts cell 4's stub transport at tier G; attested kernel greens are
   BLOCKED there by the cell's own guard (`wouldBeGreen:true,
   greenAllowed:false, "tier G is not compiler truth"` +
   `green-may-never-be-faked`, zero `pg-fill-green` glyphs) — honest, asserted
   in the headless gate. The CT gutter green IS proven headless at the MEASURED
   tier (§7(i)). Source: REPORT-GREENFLOW bound 4; REPORT-HEADLESS-UI bound 1.

4. **Two pre-existing environment skips** — (a) hub: one subtest skips on the
   Windows symlink privilege (WinError 1314), pre-existing, subtest-loud
   (REPORT-ROOTFIX / REPORT-GREENFLOW: "hub 44 OK / 1 env skip"); (b) the
   browser canvas screenshot quirk — `Page.captureScreenshot` could hang on the
   Monaco canvas; the headless UI driver deliberately never calls it (the hang
   class is gone), and `browser_shot.mjs` is retired to a MANUAL tool. Source:
   REPORT-HEADLESS-UI (screenshot hang class); hub suite skip record.

5. **Duplicated pyright subprocess bound** — the V1 vessel exercises cell 2's
   measured pyright handle AND cell 3 building its OWN pyright backend, so two
   pyright subprocess trees can co-exist under the vessel; declared, owned by
   the vessel, tree-killed at teardown. Source: vessels/v1_capability_extractor.py
   (`duplicated-subprocess` note); vessels/REPORT-V1.md.

6. **Cell-5 DOM-skin fragility bound** — the cell-5 visual skin is enforced by
   `app/test/shell1c.skin.test.tsx` asserting on `app/src/styles.css` BYTES
   (hex-grep 0, paint-untouched, no-!important-on-paint); the skin section is
   kept byte-intact through the sub-200 @import split precisely because that
   byte-level test is fragile to reordering. Source: REPORT-UI-1C-POLISH.md;
   REPORT-SUB200-app-src.md (skin byte-preservation note); styles.css header.

7. **Faultcheck scratch specifics** (from REPORT-FAULTCHECK bounds): junctioned
   node_modules in scratch copies (a link, not a copy; fault runs write nothing
   there); fault (a) uses cell 3 `--fast` (its live-pyright oracle skipped in
   that pair; the FULL cell-3 suite runs in run_all_suites.py); faults (c)/(d)
   fail at module setup by design (BUILD-FAILING guards). Fault (f) added this
   round runs `python linegate.py` in the scratch (no junctions needed).

Twelve further **code findings** (code not matching its evident claim — all
low/info severity, reported not patched) are enumerated in
[audit/AUDIT-SUMMARY.md](audit/AUDIT-SUMMARY.md) and named in the owning
per-dir READMEs.

---

## License

ProofGraph is source-available under **PolyForm Noncommercial 1.0.0** (see [LICENSE](LICENSE)). Personal use, research, teaching, hobby projects, and other noncommercial purposes are free. **Companies must obtain a commercial license** — open an issue at https://github.com/siddhesh-sinha-ug-official1/Proofgraph/issues or contact the maintainer. Third-party components ride their own licenses (elkjs EPL-2.0, vendored colorama BSD-3-Clause, vendored lean4 source Apache-2.0) — see LICENSE for the full list.

---

## Documentation tree map

Every directory README below carries a verified file table
(`name · lines · verifiedPurpose`) whose rows come verbatim from the
adversarial claim audit ([`audit/AUDIT-SUMMARY.md`](audit/AUDIT-SUMMARY.md) —
754 files, 3,671 claims, 96.8% confirmed as written; the per-area
`audit/AUDIT-*.json` files are the machine-readable source).

**Root contracts & records**:
[OUTERWALL-CONTRACT.md](OUTERWALL-CONTRACT.md) ·
[APP-SHELL-CONTRACT.md](APP-SHELL-CONTRACT.md) ·
[SEAM-MAP.md](SEAM-MAP.md) ·
[WALL-CONVENTIONS.md](WALL-CONVENTIONS.md) ·
[ARCHITECTURE-PHASE2.md](ARCHITECTURE-PHASE2.md) ·
[REMEDIATION-REPORT.md](REMEDIATION-REPORT.md) ·
[INTEGRATION-MANIFEST.json](INTEGRATION-MANIFEST.json) ·
round reports in `vessels/REPORT-*.md` (the build/session transcripts are
build-machine provenance, not shipped — see **Repository scope**)

- **schema** — [packages/schema](packages/schema/README.md) ·
  [tests](packages/schema/tests/README.md)
- **cell 1 graph-model** — [root](packages/graph-model/README.md) ·
  [src](packages/graph-model/src/README.md) ·
  [src/probe](packages/graph-model/src/probe/README.md) ·
  [src/stages](packages/graph-model/src/stages/README.md) ·
  [src/wall](packages/graph-model/src/wall/README.md) ·
  [schema](packages/graph-model/schema/README.md) ·
  [fixtures](packages/graph-model/fixtures/README.md) ·
  [tests](packages/graph-model/tests/README.md)
- **cell 2 capability-layer** — [root](packages/capability-layer/README.md) ·
  [capability](packages/capability-layer/capability/README.md) ·
  [floor](packages/capability-layer/capability/floor/README.md) ·
  [shim](packages/capability-layer/capability/shim/README.md) ·
  [tests](packages/capability-layer/capability/tests/README.md) ·
  [testbed](packages/capability-layer/testbed/README.md)
- **cell 3 structure-extractor** — [root](packages/structure-extractor/README.md) ·
  [extractor](packages/structure-extractor/extractor/README.md) ·
  [docks](packages/structure-extractor/extractor/docks/README.md) ·
  [docks/lean_driver](packages/structure-extractor/extractor/docks/lean_driver/README.md) ·
  [probe](packages/structure-extractor/extractor/probe/README.md) ·
  [t1](packages/structure-extractor/extractor/t1/README.md) ·
  [t1/tags](packages/structure-extractor/extractor/t1/tags/README.md) ·
  [selftest](packages/structure-extractor/selftest/README.md)
- **cell 4 editor-shell** — [root](packages/editor-shell/README.md) ·
  [src](packages/editor-shell/src/README.md) ·
  [src/buffer](packages/editor-shell/src/buffer/README.md) ·
  [src/cell](packages/editor-shell/src/cell/README.md) ·
  [src/conn](packages/editor-shell/src/conn/README.md) ·
  [src/gate](packages/editor-shell/src/gate/README.md) ·
  [src/lsp](packages/editor-shell/src/lsp/README.md) ·
  [src/map](packages/editor-shell/src/map/README.md) ·
  [src/mount](packages/editor-shell/src/mount/README.md) ·
  [src/mount/monaco](packages/editor-shell/src/mount/monaco/README.md) ·
  [src/probe](packages/editor-shell/src/probe/README.md) ·
  [src/probe/catalog](packages/editor-shell/src/probe/catalog/README.md) ·
  [src/schema](packages/editor-shell/src/schema/README.md) ·
  [src/verdict](packages/editor-shell/src/verdict/README.md) ·
  [test](packages/editor-shell/test/README.md) ·
  [test/helpers](packages/editor-shell/test/helpers/README.md) ·
  [test/stub](packages/editor-shell/test/stub/README.md) ·
  [scripts](packages/editor-shell/scripts/README.md) ·
  [scripts/fixture-gen](packages/editor-shell/scripts/fixture-gen/README.md) ·
  [demo](packages/editor-shell/demo/README.md)
- **cell 5 graph-view** — [root](packages/graph-view/README.md) ·
  [src](packages/graph-view/src/README.md) ·
  [demo](packages/graph-view/demo/README.md)
- **cell 6 byok-arena** — [root](packages/byok-arena/README.md) ·
  [src](packages/byok-arena/src/README.md) ·
  [adapters](packages/byok-arena/src/adapters/README.md) ·
  [anthropic](packages/byok-arena/src/adapters/anthropic/README.md) ·
  [openai](packages/byok-arena/src/adapters/openai/README.md) ·
  [gemini](packages/byok-arena/src/adapters/gemini/README.md) ·
  [probe](packages/byok-arena/src/probe/README.md) ·
  [probe/catalog](packages/byok-arena/src/probe/catalog/README.md) ·
  [wall](packages/byok-arena/src/wall/README.md) ·
  [testkit](packages/byok-arena/src/testkit/README.md) ·
  [testkit/goldens](packages/byok-arena/src/testkit/goldens/README.md) ·
  [tests](packages/byok-arena/tests/README.md)
- **hub** — [hub](hub/README.md)
- **vessels** — [vessels](vessels/README.md)
- **ai** — [ai](ai/README.md) ·
  [outlet](ai/outlet/README.md) ·
  [server](ai/server/README.md) ·
  [test](ai/test/README.md)
- **outerwall** — [outerwall](outerwall/README.md)
- **app** — [app](app/README.md) ·
  [src](app/src/README.md) ·
  [src/css](app/src/css/README.md) ·
  [test](app/test/README.md) ·
  [test/helpers](app/test/helpers/README.md) ·
  [test-acceptance](app/test-acceptance/README.md) ·
  [test-acceptance/helpers](app/test-acceptance/helpers/README.md)
- **acceptance** — [acceptance](acceptance/README.md) ·
  [checks](acceptance/checks/README.md) ·
  [shellchecks](acceptance/shellchecks/README.md) ·
  [headless](acceptance/headless/README.md) ·
  [headless/ui](acceptance/headless/ui/README.md)
- **faultcheck** — [faultcheck](faultcheck/README.md) ·
  [faultlib](faultcheck/faultlib/README.md)
- **design reference** — [shell-design](shell-design/README.md)
  (the 1c graph-first handoff the app implements; prototypes are references,
  never copied in)

Root-level runners not covered by a directory README: `run_all_suites.py`
(the 19-row clean-state command; suite list in its module docstring),
`linegate.py` (the sub-200 gate; audits its own exemption manifest before
running). Both audited in `audit/AUDIT-acceptance.json`.
