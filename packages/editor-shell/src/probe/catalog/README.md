# editor-shell/src/probe/catalog

Catalog section data: `spec.ts` (the 11 contract kinds and the p() helper) plus the five entry modules covering S0-S9 and the wall leads - 128 entries and 10 firehose flags in total.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `spec.ts` | 39 | ProbeKind union (11 contract kinds), the ProbeSpec shape, and the p() section-entry helper. |
| `mount-buffer.ts` | 72 | Catalog data: the 10 S0 mount + 13 S1 buffer lead specs (ids, kinds, payloadTypes, descriptions, buffer.change firehose). |
| `conn-lsp.ts` | 104 | Catalog data: the 12 S2 conn + 28 S3 lsp lead specs including the 6 lsp firehose leads. |
| `diag-verdict.ts` | 86 | Catalog data: the 13 S4 diag + 13 S5 verdict lead specs. |
| `select-map.ts` | 74 | Catalog data: the 12 S6 select + 11 S7 map lead specs including the 2 map firehose leads. |
| `render-gate-wall.ts` | 67 | Catalog data: the 6 S8 render + 3 S8b probe + 3 S9 gate + 4 wall lead specs including the render.frame firehose lead. |
