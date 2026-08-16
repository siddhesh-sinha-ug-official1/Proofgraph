# editor-shell/src/buffer

S1 buffer stage: `buffer-manager.ts` opens/decodes and wires change classification and the roundtrip check; `buffer-state.ts` holds the byte helpers; `open-probes.ts` the open-time decision probes; `change-handler.ts` classifies user/programmatic/silent changes; `roundtrip.ts` the C1 fixpoint check.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `buffer-manager.ts` | 177 | S1 facade class: open() decodes bytes, emits open probes, wires adapter change events to handleChangeCore, and runs the roundtrip check; exposes state()/text()/bomBytes()/encoding()/silentMutationCount()/noteUndoRedo/dispose; silentCount deliberately survives re-open (instance-lifetime, matching pre-split semantics). |
| `buffer-state.ts` | 80 | BufferState record + byte helpers: encodeLikeSource re-encodes model text in the source encoding with the original BOM bytes re-prepended; applyChanges applies utf-16-offset changes in descending order; stripWs/eolSignature/previewAt back the silent-mutation and roundtrip probes. |
| `open-probes.ts` | 89 | Open-time decision probes: encoding.decision (chosen + branches not taken), bom.detect (stripped from model text only), size.cap (SIZE_CAP_BYTES recorded bound - explicitly no degradation implemented, action always 'open'), then post-open eol.decision + open.model. |
| `change-handler.ts` | 99 | Change classification: origin user/programmatic/silent -> classify probe; silent increments silentCount and leaves expectedText lagging so roundtrip exposes it; non-silent path applies reported changes to prevAdapterText and cross-checks adapter text (hidden extra mutation -> second silent alarm); notifies listeners. |
| `roundtrip.ts` | 65 | The C1 fixpoint check: model bytes (re-encoded like source) compared to the RAW input bytes until the first legitimate edit, then to source-plus-edits; emits roundtrip.check with whitespace deltas and roundtrip.fail with the first divergence preview. |
