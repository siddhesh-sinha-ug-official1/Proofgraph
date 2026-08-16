# ai/test — the 14-test ai suite

`npm test` (node --test, Node 24 native type-stripping) runs the V6 outlet
tests (8: golden round, security, gates) and the P3 server tests (6: ask
seam, key custody). The two `*.fixtures.ts` files are shared fixtures, not
test files. 14/14 green after this round's doc fixes
(`audit/AUDIT-ai.json`).

## Files (verified)

Verified purposes from `audit/AUDIT-ai.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `v6.outlet.fixtures.ts` | 151 | Shared V6 test fixtures (not a test file): test secrets, a four-node python fixture graph with one resolved edge and one lead, golden Anthropic wire bodies, fake-route builders (happy path + looping adversary), a wall factory with deterministic clocks, and pin-payload helpers; imported by the three v6.outlet.*.test.ts files, which together hold the original 8 tests. |
| `v6.outlet.golden.test.ts` | 146 | The V6 golden-round test (1 test): one ask() through the fake transport must answer with the real unused node id while the outlet's pins, cell 6's adapter/wall pins, and the captured wire bodies agree byte-for-byte across the seam, and no key/masterSecret appears in the return, either pin stream, the wire, or wall.pins.dump(); the graph object must come back unmutated. |
| `v6.outlet.security.test.ts` | 87 | Three V6 security tests: a key planted in the question must be FOUND by the wall-side leak scan (proving the scanner) while the outlet's own pins and return stay key-free; the wall refuses dev-default/empty/missing masterSecret as insecure-master-secret; vessels/REPORT-V6.md must carry no test secret (skips if the report is absent). |
| `v6.outlet.gates.test.ts` | 114 | Four V6 gate tests: a second tool round is refused as tool-loop-exceeded with the bound pinned and both wall calls having happened; stale provenance and a resolved=false record smuggled into edges[] are refused at construction; the four local tools answer from fixture data with unknown-node/unknown-tool as named isError results and an honest no-claim when no unused set was provided. |
| `p3.server.fixtures.ts` | 114 | P3 test fixtures (not a test file): a node:http fixture hub serving /graph and /query?kind=unused with injectable envelopes and refusals, the canonical four-node envelope factory, the test masterSecret, and a POST helper; imported by both p3.server.*.test.ts files, which together hold the original 6 tests. |
| `p3.server.ask.test.ts` | 128 | Three /ask seam tests against an ephemeral createAiServer + fixture hub: the answer must carry the real unused node id with the tool calls surfaced and no secret in the bytes; a leads question must route to listLeads citing the real lead id; bad body/missing question/unknown endpoint/hub-down map to their typed classes, and a hub /query refusal becomes a 200 honest no-claim naming the class in provenanceSource. |
| `p3.server.custody.test.ts` | 108 | Three key-custody tests: an api key planted as a fixture node name is served redacted with the loud REDACTED-BY-OUTLET marker (guard 1, outlet scrub); a planted masterSecret — which the outlet does not know — turns the whole response into a 500 key-leak refusal (guard 2, server response gate); /health is typed and secret-free and a direct fakeAnthropicRoutes continuation provably composes only from tool_result bytes. |
