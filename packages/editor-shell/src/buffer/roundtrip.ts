/**
 * S1 roundtrip fixpoint check (SUB200 restructure: split from
 * BufferManager.roundtripCheck, logic and probes verbatim).
 *
 * The C1 fixpoint check. Until the first legitimate edit, the model is
 * compared against THE EXACT INPUT BYTES — so a lossy decode/encode cycle
 * (windows-1252 remaps, odd-length utf-16, unpaired surrogates) fails
 * loudly at open instead of cancelling out on both sides (review finding).
 * After edits, the reference is source-plus-legitimate-edits.
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { EditorAdapter } from "../mount/adapter.js";
import { firstDivergence } from "../util/encoding.js";
import { sha256Hex } from "../util/sha256.js";
import { encodeLikeSource, previewAt, stripWs, type BufferState } from "./buffer-state.js";

export function roundtripCheckCore(
  probe: ProbeBus,
  adapter: EditorAdapter,
  st: BufferState,
  causeId: string | null,
): boolean {
  const modelText = adapter.getText();
  const modelBytes = encodeLikeSource(st, modelText);
  const comparedAgainst = st.legitEditsApplied ? "source-plus-edits" : "source-bytes";
  const expectedBytes = st.legitEditsApplied
    ? encodeLikeSource(st, st.expectedText)
    : st.sourceBytes;
  const divergence = firstDivergence(modelBytes, expectedBytes);
  const equalBytes = divergence === -1;
  const sourceSha = sha256Hex(expectedBytes);
  const modelSha = sha256Hex(modelBytes);
  const wsCount = (s: string): number => s.length - stripWs(s).length;
  probe.emit(
    "editor.buffer.roundtrip.check",
    {
      equalBytes,
      firstDivergenceOffset: equalBytes ? null : divergence,
      // Delta in WHITESPACE character count (0 for tab→space swaps — see
      // whitespaceOnlyDivergence for that class).
      whitespaceDelta: wsCount(modelText) - wsCount(st.expectedText),
      // True exactly for the class this cell exists to catch: bytes differ
      // but every non-whitespace character is identical.
      whitespaceOnlyDivergence:
        !equalBytes && stripWs(modelText) === stripWs(st.expectedText),
      comparedAgainst,
      sourceSha,
      modelSha,
    },
    causeId,
  );
  if (!equalBytes) {
    probe.emit(
      "editor.buffer.roundtrip.fail",
      {
        firstDivergenceOffset: divergence,
        expected: previewAt(expectedBytes, divergence),
        actual: previewAt(modelBytes, divergence),
      },
      causeId,
    );
  }
  return equalBytes;
}
