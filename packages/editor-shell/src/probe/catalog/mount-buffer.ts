/** Catalog sections S0 mount + S1 buffer (entries from §6; three payloadType
 *  field lists refreshed in the adversarial claim audit to match the emitted
 *  payloads — wrapper.init, buffer.open.input, bom.detect; mutation.silent
 *  gained its optional note field). */

import { p, type ProbeSpec } from "./spec.js";

export const MOUNT_PROBES: ProbeSpec[] = [
  // ── S0 mount ────────────────────────────────────────────────────────────────
  p("editor.mount.config.input", "mount", "input",
    "{fontFamily,fontLigatures,theme,requestedPositionEncoding,readOnly}",
    "Exact config handed to the mount adapter; ground truth for what we asked the editor to be."),
  p("editor.mount.wrapper.init", "mount", "state", "{phase:'initializing',wrapperVersion,adapterKind}",
    "The mount wrapper began booting; pairs with ready/error."),
  p("editor.mount.wrapper.ready", "mount", "state", "{phase:'ready',modelUri,msSinceInit}",
    "Editor mounted and model attached; the editor is live."),
  p("editor.mount.font.applied", "mount", "value", "{requested,resolved,ligaturesOn}",
    "Whether the requested font (JetBrains Mono) actually resolved."),
  p("editor.mount.font.fallback", "mount", "branch", "{requested,fellBackTo,reason}",
    "Branch where the requested font was missing and a fallback was used."),
  p("editor.mount.theme.applied", "mount", "value", "{themeName,tokenColorCount,isDarculaStyle}",
    "Which JSON token-color theme is active; default here means Darcula work isn't wired."),
  p("editor.mount.features.enabled", "mount", "value",
    "{multiCursor,folding,minimap,findReplace,bracketMatching,semanticHighlighting}",
    "Which first-class IDE features are on — recorded truth, not assumed."),
  p("editor.mount.readonly.guard", "mount", "decision", "{readOnly,reason}",
    "Whether the model is read-only; a read-only projection must reject edits and never mutate bytes."),
  p("editor.mount.dispose", "mount", "state", "{modelUri,reason}",
    "Teardown; confirms no leaked editor/model between runs."),
  p("editor.mount.error", "mount", "error", "{where,message,stack}",
    "Mount/init failure."),
];

export const BUFFER_PROBES: ProbeSpec[] = [
  // ── S1 buffer ───────────────────────────────────────────────────────────────
  p("editor.buffer.open.input", "buffer", "input",
    "{uri,byteLength,sha256,eol,eolMixed,encoding,bomPresent}",
    "The exact bytes we were handed; reference for every round-trip assertion."),
  p("editor.buffer.open.model", "buffer", "output",
    "{versionId,lineCount,eol,detectedEncoding}",
    "The text model actually built; compare to open.input to catch an EOL/encoding flip at construction."),
  p("editor.buffer.encoding.decision", "buffer", "decision",
    "{chosen,candidates,notChosen,reason}",
    "Which encoding won and why the others lost; root of every column-offset bug downstream."),
  p("editor.buffer.eol.decision", "buffer", "decision",
    "{sourceEol,modelEol,normalized,reason}",
    "Whether the model normalized EOL; normalized:true on an unedited source is a silent-rewrite candidate."),
  p("editor.buffer.bom.detect", "buffer", "value", "{bomPresent,bomKind,stripped}",
    "BOM handling; a stripped BOM shifts byte offsets by 3 and desyncs the span index."),
  p("editor.buffer.change", "buffer", "state",
    "{versionId,changes:[{rangeOffset,rangeLength,text}],forced}",
    "Every model content change; the raw stream of buffer edits.", true),
  p("editor.buffer.mutation.classify", "buffer", "decision",
    "{versionId,classification:'user'|'programmatic'|'silent',cause}",
    "How each change was categorized; the gate input for 'no silent rewrite'."),
  p("editor.buffer.mutation.silent", "buffer", "error",
    "{versionId,changes,whitespaceChanged,eolChanged,encodingChanged,note?}",
    "ALARM: a mutation not traceable to a user keystroke or explicit API call. Fails a gate."),
  p("editor.buffer.roundtrip.check", "buffer", "value",
    "{equalBytes,firstDivergenceOffset,whitespaceDelta,whitespaceOnlyDivergence,comparedAgainst:'source-bytes'|'source-plus-edits',sourceSha,modelSha}",
    "Model bytes vs original source bytes (exact input bytes until the first legitimate edit; source-plus-edits after); the C1 byte-exact fixpoint."),
  p("editor.buffer.roundtrip.fail", "buffer", "error",
    "{firstDivergenceOffset,expected,actual}",
    "Bytes diverged with no user edit to explain it."),
  p("editor.buffer.size.cap", "buffer", "decision",
    "{byteLength,cap,action:'open'|'degrade',reason}",
    "Large-file bound; any cap past a size is logged here (no silent caps)."),
  p("editor.buffer.undoRedo", "buffer", "state",
    "{op:'undo'|'redo',versionIdBefore,versionIdAfter}",
    "Undo/redo transitions; each must leave the model byte-consistent with a prior real state."),
  p("editor.buffer.dispose", "buffer", "state", "{uri}", "Model disposed."),
];
