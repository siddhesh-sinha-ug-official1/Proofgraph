# graph-view/demo

Dev-only Vite demo (strict port 5199): runs the pipeline on the skeleton fixture with the real bundled ELK Web Worker and a mock bus, beside a polling probe-firehose table.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-view.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `main.tsx` | 96 | Dev-only Vite demo: runs runGraphView on the skeleton fixture with the real bundled ELK Web Worker and a mock bus, renders GraphView beside a polling probe-firehose table, with buttons that simulate editor-side select/hover/expand. |
| `index.html` | 15 | Demo page shell: full-height #root div loading /main.tsx as a module. |
| `vite-env.d.ts` | 1 | Vite client type reference for the demo (enables the ?worker import type). |
