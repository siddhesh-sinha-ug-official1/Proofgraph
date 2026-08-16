# byok-arena/src/probe/catalog

Catalog section data: `entry.ts` (the e() constructor and the PROVIDERS triple) plus the vault / adapters / cost-arena / scan-wall sections - 168 entries in total (163 pre-wall + 5 wall.*).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `entry.ts` | 11 | Exports the CatalogEntry constructor e() and the PROVIDERS triple that the per-provider catalog sections expand over; used only by the four sibling section modules. |
| `vault.ts` | 34 | vaultEntries() returns the 12 §6.A vault leads (storageMode, store.*, retrieve.*, redact.boundary, revoke, timing) in the pre-split order; assembled by ../catalog.ts. |
| `adapters.ts` | 148 | adapterEntries() returns 38 §6.B–G leads per provider (validateKey 5, chat build 6, send 5, normalize 10, submit 9, error 3) expanded over anthropic/openai/gemini plus 10 provider-specific leads = 124 entries; assembled by ../catalog.ts. |
| `cost-arena.ts` | 56 | costEntries() returns the 8 §6.H cost-meter leads and arenaEntries() the 16 §6.I arena leads, in the pre-split order; assembled by ../catalog.ts. |
| `scan-wall.ts` | 34 | leakScanEntries() returns the 3 §6.J secret-leak leads and wallEntries() the 5 Phase-1 wall.* leads (masterSecret.gate, schemaAbsence.gate, construct, call, reject); assembled last by ../catalog.ts so the catalog stays 163 + 5. |
