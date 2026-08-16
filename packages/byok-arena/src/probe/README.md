# byok-arena/src/probe

Probe machinery: `bus.ts` (catalog-enforced typed events with frozen payloads and a monotonic logicalClock), `redact.ts` (presence+last4 redaction and the secret registry), `leakscan.ts` (the whole-surface secret leak scan), `catalog.ts` (assembles the 168-entry catalog from `catalog/`).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `bus.ts` | 199 | ProbeBus stores typed events with a monotonic logicalClock and causeId chain; emit() rejects uncatalogued probeIds and kind mismatches and freezes payloads via structuredClone; exposes tap/find/last/query/history/log/recordError/getLogs/getErrors/dump/reset; constructed by createCell with an injectable nanoClock (wallNanos never used for ordering). |
| `redact.ts` | 68 | redactKey() returns {present,last4,provider,keyLen} and registers every raw key in a module-private Set that the leak scan reads via _secretsForScan(); emitRedactBoundary() additionally emits vault.redact.boundary; used by the vault and every adapter send path; _clearSecretsForTest() isolates leak-scan tests. |
| `leakscan.ts` | 122 | runSecretLeakScan(bus) searches every registered secret across all probe payloads (skipping secret.leak.* events), log lines, and recorded errors, plus URLs on call-kind events for raw keys and the ?key= pattern; emits secret.leak.scan/redactionShape/urlScan and returns the LeakScanReport; called via cell.runSecretLeakScan and wall pins. |
| `catalog.ts` | 35 | buildCatalog() concatenates the vault / adapters / cost-arena / leak-scan / wall catalog sections in the original single-file order into the 168-entry catalog the ProbeBus enforces at emit time; called by createCell and directly by tests. |
