# REPORT-PREPUSH-S — Cluster S (CORS/CSRF on both localhost servers)

Pre-GitHub fix wave A, push-gating trio. Findings S1 (hub) + S2 (ai server).
Date 2026-08-16. Windows / Python 3.12.10 / Node 24.

## The defect

Both localhost servers sent `Access-Control-Allow-Origin: *` on every response
and preflighted state-changing verbs with NO Origin/Host check:

- **S1** `hub/server_http.py` — any website the user visited could cross-origin
  `PUT /fs/file` (overwrite workspace files) or `POST /analyze`.
- **S2** `ai/server/core.ts` — the KEY-HOLDING server (api key + vault
  masterSecret live only in this process); any page could drive `POST /ask`.

The servers carry no cookies, so the vector is purely the browser's ambient
reach to 127.0.0.1: the wildcard let arbitrary origins both READ every response
and DRIVE the mutating routes.

## The fix — a loopback origin allowlist

One design, mirrored in both servers (`hub/cors.py`, `ai/server/cors.ts`):

- The app's own origins are the canonical allow set: the vite human face
  `:5199` plus the dev hub/ai/ws ports (`8477/8478/8479`), on `localhost` and
  `127.0.0.1`.
- Generalized to **any loopback origin** (`localhost`/`127.0.0.1`/`::1`, any
  port, http(s)). This is REQUIRED: the acceptance UI runner
  (`acceptance/checks/ui_servers.py`) serves the app on an EPHEMERAL vite port,
  so the browser's Origin is `http://localhost:<random>`. A fixed 5199-only
  allowlist would break the full headless UI acceptance. Loopback-only still
  blocks EVERY public-internet origin — a website the user visits is never a
  loopback origin, and the browser sets Origin (JS cannot forge it) — so the
  S1/S2 threat ("any website the user visits") is fully closed.
- **Reads**: `Access-Control-Allow-Origin` is echoed (exact origin, never `*`,
  with `Vary: Origin`) ONLY for an allowlisted origin. A foreign origin gets no
  ACAO → the browser blocks the read. No-Origin gets no header.
- **State-changing verbs**: a PRESENT, non-allowlisted browser Origin is refused
  `403 cross-origin-denied` BEFORE any mutation — hub PUT/POST via
  `_reject_cross_origin()` (probed `hub.http.refused`), ai `POST /ask` before
  the wall is ever driven.
- **No-Origin unchanged**: curl, the acceptance runners, and server-to-server
  calls send no Origin — never denied, behavior identical (only difference: the
  now-absent `*` header, which only a browser ever consumed).

`cross-origin-denied` added to the hub HubError vocabulary (`pipeline_log.py`),
the `_HTTP_STATUS_BY_CLASS` map (403), and the `ARCHITECTURE-PHASE2.md` seam
catalog (rebased, not reverted). Existing catalogued probe `hub.http.refused`
reused — probe catalog neither shrunk nor otherwise changed. `askroute.ts`
untouched (the per-request `rsend` is passed in as its existing `send` dep).

## Honesty invariants held

Green only from real checkers (unchanged). Probe catalog extended-not-shrunk
(in fact unchanged — reused hub.http.refused). Keys stay server-side (the ai
response gate / guard-2 is untouched; the foreign-origin refusal is an
additional gate in FRONT of it). Bundle-secret build gate untouched. Canonical
schema PIN untouched.

## Files

- NEW `hub/cors.py` (89) · NEW `ai/server/cors.ts` (61)
- `hub/server_http.py` (178) · `hub/server_http_mut.py` (97) · `hub/pipeline_log.py`
- `ai/server/core.ts` (157)
- NEW tests: `hub/test_hub_cors.py` (8 tests, registered last in `test_hub.py`) ·
  `ai/test/p3.server.cors.test.ts` (3 tests)
- Docs/logs: `ARCHITECTURE-PHASE2.md`, `hub/ASSEMBLY-CHANGES.md`,
  `ai/ASSEMBLY-CHANGES.md`
- All files ≤200 (linegate 0 offenders).

## Suites — GREEN

| suite | command | result |
| --- | --- | --- |
| hub | `python hub/test_hub.py` | 52 OK (44 baseline + 8 new), 1 skip (pre-existing symlink-priv) |
| ai | `cd ai && node --test "test/*.test.ts"` | 17 pass (14 baseline + 3 new), 0 fail |
| shell demo | `python acceptance/run_shell_demo.py` | 11 PASS, 0 FAIL (real app flow through the new allowlist) |
| demo | `python acceptance/run_demo.py --skip-ui` | 10 PASS, 0 FAIL, 1 SKIP (no-Origin runner path incl. e-ai POST /ask) |
| linegate | `python linegate.py` | 0 offenders / 731 files |

## Note for a future wave

The full headless UI acceptance (`run_demo.py` WITHOUT `--skip-ui`) drives a
real Chromium against the app on an ephemeral vite port; the loopback allowlist
was chosen specifically so that path stays green. If a later hardening wave
wants a strict fixed-port allowlist instead, it must thread the ephemeral vite
origin into `HubServer` + the ai `--allow-origin` at spawn time
(`acceptance/checks/ui_servers.py`) — deliberately out of scope here.
