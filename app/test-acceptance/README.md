# app/test-acceptance — the §7 headless acceptance suites

Run by `acceptance/run_demo.py` through `vitest.acceptance.config.ts`
(never by the default `npx vitest run`): each file drives one §7 obligation
over the three real run_demo-written analyses and writes an evidence part
that globalSetup merges into `acceptance/evidence/headless.json` for
run_demo.py to assert. Helpers (analysis loading, joint mounts, the
evidence seam) are tabled in `helpers/README.md`.
(`audit/AUDIT-app-tests.json`)

## Files (verified)

Verified purposes from `audit/AUDIT-app-tests.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `acceptance.headless.test.tsx` | 193 | 1 test (original path kept) driving §7(d)+(f)+(b): a real-analysis joint mount round-trips one select each direction with byte-equal ids and exact bounded counts, records the two browser-tier trace hops, asserts filled-outline unknown rings on every moat node, and writes the 'brushing' evidence part for run_demo.py. |
| `acceptance.ceiling.test.tsx` | 106 | 1 test for §7(h): the typst ceiling analysis (5 nodes, 0 edges, 2 leads on disk) renders unknown everywhere on the view wall's own paints — zero green, one leadGuard per lead, ghost placeholders accounted and never green — and writes the 'ceiling' evidence part. |
| `acceptance.greenflow.test.tsx` | 146 | 1 test for §7(i): the lean CT analysis paints its kernel-verified decls the canonical #2E7D32 on the view wall's paints (module stays unknown/hatched), the resolved edge renders real (zero leadGuards), the editor mounted at the measured CT tier lets the green through its guard and paints the pg-fill-green gutter glyph; writes the 'greenflow' evidence part. |
| `acceptance.doctored.test.tsx` | 75 | 1 test for §7(j): a doctored green (checker evidence stripped to source:'') on the same lean node is blocked by the editor wall's guard (editor.verdict.green.blocked, reason green-may-never-be-faked) with zero green gutter glyphs; writes the 'doctored' evidence part. |
