# editor-shell/src/probe

S8b probe machinery: `probe-bus.ts` (throws on uncataloged emits, monotonic logicalClock as the only ordering key, taps, causal refs, secret redaction) and `catalog.ts`, which assembles the 128-entry PROBE_CATALOG from the five section modules in `catalog/`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `probe-bus.ts` | 168 | S8b ProbeBus: emit() throws on uncataloged probeIds, stamps monotonic logicalClock (the only ordering key) and wallNanos only on timing kinds, delivers to per-id and '*' taps, keeps full history; ref() builds causeIds; query helpers byId/byKind/byStage/causeChain; redactSecret shows presence+last-4 only for secrets longer than 8 chars. |
| `catalog.ts` | 49 | Assembles PROBE_CATALOG (128 entries) by splicing the twelve stage-group arrays from the five catalog section modules in the original stage order and derives FIREHOSE_IDS (10) from the firehose flags; pinned by tests 19/19b/22b. |
