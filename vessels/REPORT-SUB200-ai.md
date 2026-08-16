# REPORT — SUB200 restructure, area `ai/`

Round: adversarial-round prep. Mission: every non-exempt source file in `ai/`
UNDER 200 lines, split by cohesion behind facades, behavior-preserving.
Date: 2026-08-02. Result: **done — all files <=161 lines, suite 14/14 green.**

## What was split

| Old file (lines) | New modules (lines) |
| --- | --- |
| `ai/service.ts` (451) | facade `ai/service.ts` (69) + `ai/outlet/types.ts` (89) + `ai/outlet/pins.ts` (56) + `ai/outlet/tools.ts` (161) + `ai/outlet/ask.ts` (143) + `ai/outlet/core.ts` (83) |
| `ai/server.ts` (480) | facade `ai/server.ts` (83) + `ai/server/config.ts` (36) + `ai/server/fakemodel.ts` (115) + `ai/server/hub.ts` (74) + `ai/server/askroute.ts` (100) + `ai/server/core.ts` (135) + `ai/server/cli.ts` (60) |
| `ai/test/v6.outlet.test.ts` (455, 8 tests) | `v6.outlet.fixtures.ts` (151, helpers) + `v6.outlet.golden.test.ts` (146, 1) + `v6.outlet.security.test.ts` (87, 3) + `v6.outlet.gates.test.ts` (114, 4) |
| `ai/test/p3.server.test.ts` (326, 6 tests) | `p3.server.fixtures.ts` (114, helpers) + `p3.server.ask.test.ts` (128, 3) + `p3.server.custody.test.ts` (108, 3) |

Split axes: server = http plumbing / ask-route + response-gate / cli (per
brief, plus config/fakemodel/hub for cohesion); service = outlet core / tools
/ scrub (pins) plus a types module; tests split by their numbered
section-groups, shared fixtures hoisted verbatim into non-test helper modules.

## Facade guarantees (external importers: ZERO changes)

- `ai/service.ts` re-exports: `MAX_TOOL_ROUNDS`, `TOOL_OUTPUT_MAX_BYTES`,
  `OutletFailure`, `createAiOutlet`, and all types (`OutletFailureClass`,
  `OutletGraph`, `OutletProvenance`, `OutletProbeEvent`, `AskOptions`,
  `AskResult`, `AiOutlet`, `AiOutletConfig`).
- `ai/server.ts` re-exports: `AI_SERVER_VERSION`, `DEFAULT_PORT`,
  `DEFAULT_HUB_BASE`, `DEFAULT_MODEL`, `fakeAnthropicRoutes`,
  `fetchHubSnapshot`, `OutletHttpRefusal`, `createAiServer`, types
  (`AiTransport`, `AiServerConfig`, `AiServerHandle`, `HubSnapshot`) — and
  still DEFINES `AI_SERVER_DEFAULT_MASTER_SECRET` + `FAKE_TRANSPORT_API_KEY`
  as string literals in-file, because `app/test/p3.build.gate.test.ts`
  live-extracts those literals from `ai/server.ts` source by regex (replicated
  against the new facade: both extract correctly).
- `node ai/server.ts` CLI preserved: the facade ends with
  `maybeRunCli(import.meta.url)`, so `node ai/server.ts` boots exactly as
  before (verified: ready-line JSON printed, fake transport, ephemeral port)
  and importing the facade starts nothing (verified via
  `acceptance/headless/ai_check.mjs`, which dynamic-imports the facade and got
  its usual typed `hub-unreachable` against a down hub).
- Key-custody tests intact: guard 1 (outlet scrub) and guard 2 (server
  response gate) negative controls run unmodified and pass.

## Suite

`cd ai && node --test "test/*.test.ts"`: **14/14 pass** (baseline 14 -> 14;
same test names, no assertion weakened). Fixture helper modules do not match
the `test/*.test.ts` glob and add no tests.

## Verification table — every file in `ai/` (ceiling: <200)

| File | Lines |
| --- | --- |
| `ai/server.ts` (facade) | 83 |
| `ai/service.ts` (facade) | 69 |
| `ai/outlet/types.ts` | 89 |
| `ai/outlet/pins.ts` | 56 |
| `ai/outlet/tools.ts` | 161 |
| `ai/outlet/ask.ts` | 143 |
| `ai/outlet/core.ts` | 83 |
| `ai/server/config.ts` | 36 |
| `ai/server/fakemodel.ts` | 115 |
| `ai/server/hub.ts` | 74 |
| `ai/server/askroute.ts` | 100 |
| `ai/server/core.ts` | 135 |
| `ai/server/cli.ts` | 60 |
| `ai/test/v6.outlet.fixtures.ts` | 151 |
| `ai/test/v6.outlet.golden.test.ts` | 146 |
| `ai/test/v6.outlet.security.test.ts` | 87 |
| `ai/test/v6.outlet.gates.test.ts` | 114 |
| `ai/test/p3.server.fixtures.ts` | 114 |
| `ai/test/p3.server.ask.test.ts` | 128 |
| `ai/test/p3.server.custody.test.ts` | 108 |
| `ai/package.json` | 10 (data/config) |
| `ai/ASSEMBLY-CHANGES.md` | log (this round's entry) |

Exemptions relied on: **none** (no generated artifacts, goldens, or vendored
fixtures live in this area).

## Notes / deviations

- Benign module cycle `ai/server.ts <-> ai/server/{core,cli}.ts` for the two
  secret literals, forced by the build-gate's live source extraction; values
  are read only inside function bodies after both modules evaluate (ESM-safe,
  exercised by every server test and the CLI boot).
- `outlet/tools.ts` (161) and `v6.outlet.fixtures.ts` (151) sit above the
  135-150 comfort target but well under the 200 ceiling; splitting the four
  tool executors or the golden wire fixtures further would cut cohesion, not
  add it.
- No bugs found in the area during the split (nothing to flag).

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 1 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: ai/server.ts 83→88. The 'all files <=161' bound still holds (tools.ts 161 is the max). Both facades re-imported live under node: full claimed export surfaces present, secret literals + maybeRunCli(import.meta.url) tail intact. All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
