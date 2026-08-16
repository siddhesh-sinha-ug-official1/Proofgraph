# app/test-acceptance/helpers — acceptance-suite fixtures and the evidence seam

Loads the three real run_demo-written analyses (loud
acceptance-evidence-missing refusal when absent — never minting its own),
mounts the joint walls on cell 4's sanctioned stubs, and implements the
split-evidence seam: per-file parts written by `registerEvidencePart`,
merged by `globalSetup` into the `headless.json` shape run_demo.py reads.
(`audit/AUDIT-app-tests.json`)

## Files (verified)

Verified purposes from `audit/AUDIT-app-tests.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `analyses.ts` | 142 | Loads the three real run_demo-written analyses with a loud acceptance-evidence-missing refusal (never minting its own), double-parses each so === proves content identity, derives ids/URIs/envelope builders/caret math and the editor-vocabulary node mappers, and reads LEAN_MEASURED_TIER from the analysis provenance. |
| `mounts.ts` | 96 | mountJoint (moat editor wall at honest stub tier G + graph wall on one joined bus) and mountLeanEditor (lean doc at the measured tier) on cell 4's sanctioned stubs, plus the teardown registrar and of/lastPayload/utf8 pin helpers for the acceptance suites. |
| `evidence.ts` | 29 | registerEvidencePart registers an afterAll writing one suite's accumulated evidence record to evidence/headless-parts/<name>.json — the per-file half of the split-evidence seam merged by globalSetup.ts. |
| `globalSetup.ts` | 41 | Vitest globalSetup (wired in vitest.acceptance.config.ts): setup deletes headless.json + all parts so stale evidence never masquerades; teardown merges whatever parts exist with the base fields into the same headless.json shape run_demo.py reads. |
