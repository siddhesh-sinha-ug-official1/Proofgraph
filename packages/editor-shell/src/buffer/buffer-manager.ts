/**
 * S1 — Buffer / Model manager.
 *
 * Owns the text model = the text projection of the source. The load-bearing
 * invariant: the editor NEVER silently rewrites the buffer — no whitespace
 * normalization, no EOL flip, no re-encoding, no BOM strip — unless a real
 * user keystroke or explicit API call caused it. Every mutation is classified
 * user | programmatic | silent; a silent one is an error probe + fails a gate.
 *
 * Mechanism: `expectedText` mirrors the model, updated ONLY by user and
 * programmatic changes. The roundtrip check re-encodes `model text` with the
 * original encoding/BOM and compares byte-for-byte against what the source
 * plus legitimate edits should be (at open: the exact input bytes — the C1
 * byte-exact fixpoint of the text projection).
 *
 * SUB200 restructure: state + byte helpers in ./buffer-state.ts, open-time
 * probes in ./open-probes.ts, change classification in ./change-handler.ts,
 * the roundtrip check in ./roundtrip.ts. This module remains the public path.
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import type { ContentChangeEvent, EditorAdapter } from "../mount/adapter.js";
import { decodeBytes, detectEol, type DecodeResult } from "../util/encoding.js";
import { sha256Hex } from "../util/sha256.js";
import { encodeLikeSource, type BufferState } from "./buffer-state.js";
import { emitPostOpenProbes, emitPreOpenProbes } from "./open-probes.js";
import { handleChangeCore } from "./change-handler.js";
import { roundtripCheckCore } from "./roundtrip.js";

export { applyChanges } from "./buffer-state.js";
export { SIZE_CAP_BYTES } from "./open-probes.js";

export interface EditorModelState {
  uri: string;
  languageId: string;
  versionId: number;
  eol: "LF" | "CRLF";
  eolMixed: boolean;
  encoding: string;
  byteLength: number;
  lineCount: number;
  sha256: string;
  bomPresent: boolean;
}

export interface BufferChangeNotification {
  event: ContentChangeEvent;
  classification: "user" | "programmatic" | "silent";
  changeProbe: ProbeEvent;
}

export class BufferManager {
  private probe: ProbeBus;
  private adapter: EditorAdapter;
  private st!: BufferState;
  private listeners: Array<(n: BufferChangeNotification) => void> = [];
  private unsubscribe: (() => void) | null = null;

  constructor(probe: ProbeBus, adapter: EditorAdapter) {
    this.probe = probe;
    this.adapter = adapter;
  }

  open(opts: {
    uri: string;
    bytes: Uint8Array;
    languageId: string;
    readOnly: boolean;
    causeId?: string | null;
  }): ProbeEvent {
    const sourceBytes = opts.bytes.slice();
    const decode = decodeBytes(sourceBytes);
    this.st = {
      uri: opts.uri,
      languageId: opts.languageId,
      sourceBytes,
      decode,
      eolInfo: detectEol(decode.text),
      expectedText: decode.text,
      prevAdapterText: decode.text,
      legitEditsApplied: false,
      openProbe: null,
      // silentCount is an instance-lifetime counter (matches the pre-split
      // field, which open() never reset).
      silentCount: this.st?.silentCount ?? 0,
    };

    const inputSha = sha256Hex(sourceBytes);
    this.st.openProbe = this.probe.emit(
      "editor.buffer.open.input",
      {
        uri: this.st.uri,
        byteLength: sourceBytes.length,
        sha256: inputSha,
        eol: this.st.eolInfo.eol,
        eolMixed: this.st.eolInfo.mixed,
        encoding: decode.encoding,
        bomPresent: decode.bom.bomPresent,
      },
      opts.causeId ?? null,
    );
    const openRef = this.probe.ref(this.st.openProbe);

    emitPreOpenProbes(this.probe, this.st, openRef);

    this.adapter.openModel({
      uri: this.st.uri,
      text: decode.text,
      languageId: this.st.languageId,
      readOnly: opts.readOnly,
    });
    this.unsubscribe = this.adapter.onDidChangeContent((e) =>
      handleChangeCore(this.probe, this.adapter, this.st, this.listeners, e),
    );

    emitPostOpenProbes(this.probe, this.st, this.adapter, openRef);

    this.roundtripCheck(openRef);
    return this.st.openProbe;
  }

  onChange(cb: (n: BufferChangeNotification) => void): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** The C1 fixpoint check — see ./roundtrip.ts for the full story. */
  roundtripCheck(causeId: string | null = null): boolean {
    return roundtripCheckCore(this.probe, this.adapter, this.st, causeId);
  }

  noteUndoRedo(op: "undo" | "redo", versionIdBefore: number, versionIdAfter: number): void {
    this.probe.emit("editor.buffer.undoRedo", { op, versionIdBefore, versionIdAfter }, null);
  }

  state(): EditorModelState {
    const text = this.adapter.getText();
    const eolInfo = detectEol(text);
    const bytes = encodeLikeSource(this.st, text);
    return {
      uri: this.st.uri,
      languageId: this.st.languageId,
      versionId: this.adapter.getVersionId(),
      eol: eolInfo.eol,
      eolMixed: eolInfo.mixed,
      encoding: this.st.decode.encoding,
      byteLength: bytes.length,
      lineCount: text.split("\n").length,
      sha256: sha256Hex(bytes),
      bomPresent: this.st.decode.bom.bomPresent,
    };
  }

  text(): string {
    return this.adapter.getText();
  }

  bomBytes(): number {
    return this.st.decode.bom.bomBytes;
  }

  encoding(): DecodeResult["encoding"] {
    return this.st.decode.encoding;
  }

  silentMutationCount(): number {
    return this.st.silentCount;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.probe.emit("editor.buffer.dispose", { uri: this.st?.uri ?? "" }, null);
  }
}
