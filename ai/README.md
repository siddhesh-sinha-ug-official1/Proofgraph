# proofgraph/ai — the V6 AI outlet + P3 ai face server (assembly code, NOT a cell)

Two facades at frozen module paths over the byok-arena cell's wall:
`service.ts` re-exports the V6 outlet surface (`createAiOutlet` — graph as
data, one tool round, key-scrub invariants) from `outlet/`; `server.ts`
re-exports the P3 ai face server from `server/` and starts it only when run
as `node ai/server.ts`. The two server-side secret literals live in
`server.ts`, where `app/test/p3.build.gate.test.ts` live-extracts them for
the built-bundle secret scan. Suite: `npm test` (node --test over
`test/*.test.ts`, Node 24 native type-stripping) = 14 tests, re-run green
after this round's doc fixes (`audit/AUDIT-ai.json`).

- `outlet/` — the outlet implementation (see `outlet/README.md`)
- `server/` — the server modules (see `server/README.md`)
- `test/` — the 14-test suite + fixtures (see `test/README.md`)
- `ASSEMBLY-CHANGES.md` — the area change log (SUB200 split record + dated drift notes; no audit row of its own)

## Files (verified)

Verified purposes from `audit/AUDIT-ai.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `service.ts` | 69 | Facade at the original V6 path: re-exports the outlet public surface (createAiOutlet, OutletFailure, MAX_TOOL_ROUNDS, TOOL_OUTPUT_MAX_BYTES, all outlet types) from ai/outlet/*; its header carries the outlet contract (graph as data, one tool round, key-scrub invariants) that the impl modules and tests uphold. |
| `server.ts` | 88 | Facade for the P3 ai face server: holds the two server-side secret literals (app/test/p3.build.gate.test.ts live-extracts them from this file's source), re-exports the server/* surface, and calls maybeRunCli(import.meta.url) so `node ai/server.ts` starts the server while a mere import never does. |
| `package.json` | 10 | Vessel manifest: type=module, npm test = node --test over test/*.test.ts (Node 24 native type-stripping), zero dependencies declared — matching its own description. |
