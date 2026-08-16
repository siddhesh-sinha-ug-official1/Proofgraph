# byok-arena/src/testkit

Golden-driven fake transport: `fakefetch.ts` routes requests by URL/method predicates and picks first-turn vs continuation goldens per provider; `goldens.ts` is the facade over the fixtures in `goldens/`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `fakefetch.ts` | 140 | makeFakeFetch routes requests by URL/method predicates with per-route match counts; providerHappyRoutes serves the golden model lists and inspects request bodies to pick first-turn vs continuation goldens per provider (geminiVariant selects the no-id 2.5 golden); sequenceFetch replays a fixed response list for retry/error tests. |
| `goldens.ts` | 28 | Facade re-exporting every golden fixture from the per-provider goldens/ modules plus the shared task; the import path fakefetch, demo.ts, and tests use. |
