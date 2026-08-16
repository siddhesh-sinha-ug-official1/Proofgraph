# app/test/helpers — shared fixtures for the app vitest suites

Not test files — imported by the suites in `..`: mock hubs speaking the
APP-SHELL-CONTRACT route shapes, jsdom shims so React Flow can measure, the
shared probe/localStorage reset, the spawned-real-hub V4 setup with its pin
helpers, and the V5 joint-mount fixture. (`audit/AUDIT-app-tests.json`)

## Files (verified)

Verified purposes from `audit/AUDIT-app-tests.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `p3fixture.ts` | 99 | Exports the 6-node/1-edge/1-lead moatpkg fixture envelope, ruling-8 analysis verdicts, a contract-shaped /analysis payload and an httpGetOf route-table transport; imported by p3.face.test.tsx and p3.face.honesty.test.tsx. |
| `reactFlowShims.ts` | 41 | installReactFlowShims() installs jsdom mocks (ResizeObserver, DOMMatrixReadOnly, offsetWidth/Height getters, SVG getBBox) so React Flow can measure; called via beforeAll by every app component suite except shell1c.skin (which keeps its own verbatim copy). |
| `shellFaceFixture.tsx` | 141 | Mock hub (APP-SHELL-CONTRACT route shapes, PUT override hook, call recorder) + renderShell/ensureMenubar/openMenu/menuItem helpers for the shell.face.* suites; SCHEMA_HASH equals the real pinned schema hash. |
| `shell1cFixture.tsx` | 120 | Mock hub + renderShell/menu helpers for the shell1c.face.* suites; same contract shapes as shellFaceFixture but no PUT override hook and an empty /pins/history; kept separate because the two rounds' recorded routes differ. |
| `shellProbe.ts` | 16 | resetShellState() clears localStorage + the shell probe log; probes(id) filters shellLogHistory by probeId; the shared beforeEach of every shell.* / shell1c.* suite. |
| `v4hub.ts` | 145 | setupV4Hub() registers beforeAll/afterAll that spawn vessels/serve_hub_v4.py on ephemeral ports, read its info line, poll /health, run the healthy-path fetchGraphVerified + graph-view wall mount, and tear down via stdin EOF with a loud orphaned-python guard; also exports the node:http transport. |
| `v4pins.ts` | 94 | Pin/bus/dump helpers for the v4.serve.* suites: select-only localBus, of/last pin filters, pinsHistory with truncation asserted false at limit=100000, rfPartition ghost/real split, setEq and UTF-8 byteIdentical asserts. |
| `v5joint.ts` | 127 | Loads the editor-shell clean.py fixtures (two independent parses so === proves content identity), builds the shared-universe envelope minus `double`, exports caret positions, mountJoint (editor wall on sanctioned stubs + graph wall on one joined bus) and the per-test teardown registrar for the v5.bus.* suites. |
