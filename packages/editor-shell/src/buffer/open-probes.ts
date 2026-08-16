/**
 * S1 open-time decision probes (SUB200 restructure: split from
 * BufferManager.open, probe payloads verbatim).
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { EditorAdapter } from "../mount/adapter.js";
import { detectEol } from "../util/encoding.js";
import type { BufferState } from "./buffer-state.js";

/** No-silent-caps bound: files past this get a logged decision, never a quiet degrade. */
export const SIZE_CAP_BYTES = 20 * 1024 * 1024;

/** Encoding / BOM / size-cap decisions — emitted BEFORE the model is built. */
export function emitPreOpenProbes(probe: ProbeBus, st: BufferState, openRef: string): void {
  probe.emit(
    "editor.buffer.encoding.decision",
    {
      chosen: st.decode.encoding,
      candidates: st.decode.candidates,
      notChosen: st.decode.notChosen,
      reason:
        st.decode.encoding === "utf-8"
          ? "bytes decode as strict utf-8"
          : st.decode.encoding === "latin1"
            ? "invalid utf-8; latin1 is the lossless byte-preserving fallback"
            : "utf-16 BOM present",
    },
    openRef,
  );
  probe.emit(
    "editor.buffer.bom.detect",
    {
      bomPresent: st.decode.bom.bomPresent,
      bomKind: st.decode.bom.bomKind,
      // BOM is stripped from MODEL TEXT only; roundtrip re-prepends its
      // bytes, and S7 offsets account for it — the file bytes never change.
      stripped: st.decode.bom.bomPresent,
    },
    openRef,
  );
  probe.emit(
    "editor.buffer.size.cap",
    {
      byteLength: st.sourceBytes.length,
      cap: SIZE_CAP_BYTES,
      // Honest: NO size-based degradation is implemented this round; the
      // bound is recorded here so a future degrade is a visible decision,
      // and the probe never claims behavior that doesn't exist.
      action: "open",
      reason:
        st.sourceBytes.length > SIZE_CAP_BYTES
          ? "file exceeds the recorded bound but no degradation is implemented this round — opening fully (recorded, not silent, not fictional)"
          : "under size cap; no degradation",
    },
    openRef,
  );
}

/** EOL decision + the model actually built — emitted AFTER adapter.openModel. */
export function emitPostOpenProbes(
  probe: ProbeBus,
  st: BufferState,
  adapter: EditorAdapter,
  openRef: string,
): void {
  const modelEolInfo = detectEol(adapter.getText());
  probe.emit(
    "editor.buffer.eol.decision",
    {
      sourceEol: st.eolInfo.eol,
      modelEol: modelEolInfo.eol,
      normalized:
        modelEolInfo.eol !== st.eolInfo.eol || modelEolInfo.mixed !== st.eolInfo.mixed,
      reason: "cell preserves source EOL exactly; no normalization at construction",
    },
    openRef,
  );
  probe.emit(
    "editor.buffer.open.model",
    {
      versionId: adapter.getVersionId(),
      lineCount: adapter.getText().split("\n").length,
      eol: modelEolInfo.eol,
      detectedEncoding: st.decode.encoding,
    },
    openRef,
  );
}
