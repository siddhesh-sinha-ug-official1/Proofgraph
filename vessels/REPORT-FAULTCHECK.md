# REPORT — FAULTCHECK (remediation worklist item 4)

**Task**: (4.1) fault-injection tests proving each core guard CATCHES its
defect — ONE deliberate defect per guarantee, injected into a SCRATCH COPY,
caught by the EXISTING suite/gate, never by a reimplemented check; (4.2) ONE
clean-state command running every suite of the assembly with reproducible
totals.
**Status**: DONE with one declared concurrency limitation — all FIVE guards
measured catching their defect (each in a recorded invocation);
`run_all_suites.py` run ONCE fully, table below VERBATIM: 17/18 rows PASS,
and the single FAIL row is the faultcheck suite itself, whose fault-(a)
CONTROL was voided by a torn snapshot while a concurrent whole-assembly
refactor stream was landing cell-3 file splits mid-copy (details + the
solo (a) record below — the guard itself was never the failure).
**Cells touched**: NONE.  New assembly code only:
`proofgraph/faultcheck/run_faults.py` + `proofgraph/run_all_suites.py`
(logged in agentic-convos/remediation-round.md per the standing rule).
**Date**: 2026-08-02.

## 4.1 — the fault-injection suite (`python faultcheck/run_faults.py`)

Honesty protocol, per fault:

1. fresh scratch copy of the whole proofgraph tree — robocopy to a tempdir;
   `node_modules` junctioned read-only where a JS suite needs them;
   `__pycache__`/`.git`/`app/dist`/`.vite` excluded (regenerated state,
   never inputs).  **The working tree is never touched or restored — the
   scratch is discarded.**
2. **CONTROL**: the exact suite command runs CLEAN in the scratch copy and
   must PASS — so a later failure is the defect's doing, not the copy's.
3. ONE deliberate defect (anchored text patch; the harness REFUSES a
   missing or ambiguous anchor — no silent no-op).
4. the SAME command re-runs and must FAIL (nonzero exit) **and** carry the
   guard's own named failure class in its output (a signature match — "any
   failure" does not count as caught).
5. scratch discarded — junctions unlinked FIRST (`os.rmdir` removes the
   link, never the target), then rmtree; deletion refuses paths outside
   tempdir.

Dev filter exists (`run_faults.py a c` runs a subset) — the unfiltered run
is the record.

### The five guarantees — each guard measured catching its defect

All quotes below are VERBATIM suite output from recorded invocations this
session (the failing guard itself, not a paraphrase).

**(a) verdict-integrity — `unbacked-green`.**
Defect: `extractor/docks/lean_dock.py` green branch mints `fill.status
green` with `source=""` — checker evidence stripped at the source.
Suite: `python selftest/run_all.py --fast` (cell 3's own suite; `--fast` is
its documented mode skipping only the live-pyright oracle, unrelated to the
lean defect).  Control: **Ran 129 tests … OK**.  Fault run: **FAILED
(errors=2)** — the assemble-stage green audit raised the named class:

> `extractor.assemble.UnbackedGreenError: node n_b1a9ac7bf8258491 carries a
> green fill without a kernel attestation (origin='checked', source='',
> tier='CT') — green may never be faked (failure class unbacked-green)`

**(b) Py↔TS ID consistency — `serializer-edge-drop`.**
Defect: `hub/server.py` `/graph` serve path flips ONE byte of the first
node id AFTER the hub's own id-set verify (a tampering-serializer
stand-in — so the corruption reaches the wire and the CLIENT gate must
catch it).  Suite: `npx vitest run --no-cache test/v4.serve.test.tsx` (the
V4 Python↔TS connector test).  Control: **Tests 8 passed (8)**.  Fault
run: **Test Files 1 failed, Tests 8 skipped** — `fetchGraphVerified`'s
three-way equality gate (app/src/graphSource.ts) threw in `beforeAll`,
naming the exact flipped id:

> `GraphSourceError: failure-class=serializer-edge-drop: served id sets
> diverge from the model wall's pin-surface truth — nodes:
> missing=[n_89a4b4877bbbbe37] extra=[n_89a4b4877bbbbe30] — the cheap
> serializer (or a tampering proxy) dropped or invented rows`

**(c) leads/edges separation — `lead-in-edges`.**
Defect: `extractor/pipeline.py` envelope partition regressed — the
`if e.resolved` filter dropped, so unresolved rows ride `edges[]`.
Suite: `python vessels/test_v3_extractor_to_model.py` (the extractor→model
ingest vessel).  Control: **Ran 16 tests … OK**.  Fault run: **FAILED
(errors=1)** — measured: the extractor WALL's face guard
(`validate_envelope`) refuses the envelope BEFORE the model wall sees it;
the model wall's own `lead-in-edges` ingest check and `validate.py`'s
leads-segregation pass stand behind it as second/third shields, each
keeping its own negative-test coverage:

> `proofgraph_wall_structure_extractor.LeadInEdgesError:
> failure-class=lead-in-edges: edge e_fb5e312c80e57d7b in edges[] is a lead
> (resolved=False, dstId='unresolved:<dynamic>') — resolved=false is a
> lead, never an edge`

**(d) provenance completeness — `provenance-hole`.**
Defect: `outerwall/provenance.py` `build()` stops recording the nodes'
`"tier"` field.  Suite: `python outerwall/test_outerwall.py`.  Control:
**Ran 41 tests … OK**.  Fault run: **FAILED (errors=1), Ran 0 tests** —
`assert_no_holes` is BUILD-FAILING inside `analyze()`, so the suite's
`setUpModule` refuses to even produce a world to test (exactly the guard's
contract — a graph with provenance holes never reaches an assertion):

> `outerwall.ProvenanceHole: failure-class=provenance-hole: 6 element(s)
> with missing provenance — first: node n_af0446d0d9a8e917: provenance
> field 'tier' missing/None`

**(e) bundle credential check — the P3 build-gate dist scan.**
Defect: cell 6's insecure dev masterSecret literal
(`byok-arena-dev-master-secret-CHANGE-ME`, one of the gate's scanned
patterns) planted in `app/src/main.tsx` as a global side effect the
bundler keeps.  Suite: `npx vitest run --no-cache
test/p3.build.gate.test.ts` (the gate itself runs `npx vite build` and
byte-scans every dist asset).  Control: **Tests 1 passed** (clean build +
clean scan).  Fault run: **Tests 1 failed** — the scan names the asset and
the pattern:

> `AssertionError: key-shaped material reached the browser bundle:` …
> `assets\index-BhK1Rh1e.js: cell-6 insecure dev masterSecret: expected
> [ Array(1) ] to deeply equal []`

## 4.2 — the ONE clean-state command (`python run_all_suites.py`)

What "clean state" means here (declared honestly, nothing smoothed; the
runner prints this block at startup):

* every suite runs in a FRESH OS subprocess (new python interpreter / new
  node VM), sequentially — no in-process state survives between suites and
  none can lean on another's servers, ports, or load;
* vitest suites run `--no-cache` (no cached transform/test-result reuse);
* editor-shell's `npm test` rebuilds its dist from source before testing;
* acceptance runs regenerate analyses/evidence from live `analyze()`
  (run_demo writes `analysis-*.json` BEFORE its §7 gates);
* all servers under test bind EPHEMERAL ports; the live stack's fixed
  ports (8477/8478/8479/5199) are never squatted — the browser step is
  skipped (`--skip-browser`) per the worklist item, so no live vite is
  reused either;
* the fault-injection suite builds its own scratch copies in tempdir and
  discards them;
* NOT reset, declared: python `__pycache__` bytecode and npm `node_modules`
  (dependency/compilation caches — they cannot cache a test RESULT), the
  elan/lake toolchains and the npx package cache (environment), and the
  suites' recorded fixtures (deliberate recordings whose freshness is gated
  by the suites' own recording-vs-live tests).

### The single full run — output table VERBATIM (2026-08-02)

    suite                                  result      time   counts
    ----------------------------------------------------------------
    schema (py)                            PASS        0.3s   23 tests, OK
    schema (ts)                            PASS        1.0s   pass 14, fail 0
    cell 1 graph-model                     PASS        2.6s   113 tests, OK
    cell 2 capability-layer                PASS       55.5s   131 passed in 54.18s
    cell 3 structure-extractor             PASS       75.6s   140 tests, OK
    cell 4 editor-shell                    PASS        6.6s   pass 96, fail 0
    cell 5 graph-view                      PASS       11.8s   Tests 133 passed (133)
    cell 6 byok-arena                      PASS        2.2s   pass 103, fail 0
    hub                                    PASS       29.7s   44 tests, OK
    outerwall                              PASS       89.8s   41 tests, OK
    ai                                     PASS        1.3s   pass 14, fail 0
    app vitest (+build gate)               PASS       43.2s   Tests 111 passed | 1 todo (112)
    app tsc --noEmit                       PASS        5.9s   clean (no output)
    vessel V1 (capability x extractor)     PASS       43.0s   11 tests, OK
    vessel V3 (extractor x model)          PASS        1.4s   16 tests, OK
    acceptance run_demo --skip-browser     PASS       68.3s   10 PASS, 0 FAIL, 1 SKIP ==
    acceptance run_shell_demo              PASS       34.3s   11 PASS, 0 FAIL ==
    fault-injection (faultcheck)           FAIL      223.7s   0 tests, FAILED
    ----------------------------------------------------------------
    GRAND TOTAL                            FAIL      696.2s   17/18 suites passed

(The run_demo SKIP is `browser-spot-check: --skip-browser given` — the
worklist item's own design.  Cell 3 counted 140 tests at sweep time —
additive growth over GREEN-FLOW's 131 from the concurrent real-inputs
stream; probe APIs never shrank.)

### The FAIL row, dissected (measured, not smoothed)

Inside the sweep's faultcheck record, faults **b, c, d, e re-confirmed
CAUGHT** (same named classes as §4.1).  Fault (a)'s CONTROL run failed —
`Ran 124 tests … FAILED (errors=72)` in 7.4s — and the harness therefore
**voided the fault verdict instead of blaming the guard**
("CONTROL … FAIL — scratch env broken, fault run void").  Root cause,
measured live right after: a concurrent refactor stream was landing a
cell-3 file split (`pyright_backend.py` into `pyright_common/lsp/recorded`,
`pipeline.py` into `pipeline_config/docks`, catalog splits) at that exact
moment; the robocopy snapshot caught the tree TORN.  The same command in
the same scratch design had already passed its control (129 OK) and caught
the defect (`unbacked-green`, FAILED errors=2) in the solo (a) record
earlier this same session — quoted in §4.1.  The control-run requirement
exists precisely for this: a broken environment is reported as a broken
environment, never as a guard verdict.

## Bounds (declared, riding this report)

1. **No single 5/5-in-one-invocation faultcheck record exists yet.**  Each
   of the five guards has a recorded catch (solo invocations §4.1; b–e
   re-confirmed inside the sweep), but the one-command 5/5 re-record — and
   with it an 18/18 sweep — is owed at the next QUIESCENT point of the
   tree: `python faultcheck/run_faults.py` then `python run_all_suites.py`.
2. **The workspace was a live multi-agent site throughout**: a headless-UI
   stream writing `acceptance/` evidence, a UI pixel-polish stream in
   `app/`, and a whole-assembly refactor stream that rewrote large parts of
   all six cells during/after the sweep.  At report close, cell 3's
   `run_all.py --fast` is RED mid-refactor (ImportError:
   `test_connectors.py` imports `_uri_to_path` from `pyright_backend`,
   which the split moved) — owned by the refactor stream, said out loud
   here, not fixed from this brief (cells: ONLY where a brief says so).
   The sweep's cell-3 PASS (140 OK) predates those edits by minutes; the
   table is timestamped truth, not a standing claim.
3. **Junctioned node_modules in scratch copies** (app 240M / graph-view
   107M / editor-shell): fault runs read dependencies through junctions
   instead of copying; they write nothing there (`--no-cache`; `vite
   build` writes only the scratch `dist/`) — a link, not a copy, declared.
4. **Fault (a) uses `--fast`** (cell 3's own suite mode): the live-pyright
   oracle is skipped in that fault's control+fault pair; the FULL cell-3
   suite (live pyright) runs in `run_all_suites.py`.
5. **Faults (c)/(d) fail at module setup** ("Ran 0 tests"): the guards are
   BUILD-FAILING by design — the suite refusing to produce a world IS the
   failure report, and the harness still demands the named class.
6. **Guard-stack ordering measured, not assumed**: fault (c) proved cell
   3's wall face guard fires FIRST; fault (b) was injected AFTER the hub's
   server-side verify precisely so the TS-side gate is what the record
   proves.
7. Windows cp1252 pipes: both runners reconfigure their own stdout to
   UTF-8 (suite evidence carries arrows); a dev-run crash on exactly this
   was fixed BEFORE the recorded runs — the fault-(e) guard verdict was
   unaffected (control PASS / fault FAIL / signature found, re-confirmed
   in the sweep record).
