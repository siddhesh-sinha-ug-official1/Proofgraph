/**
 * S1 change classification (SUB200 restructure: split from
 * BufferManager.handleChange, logic and probes verbatim).
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { ContentChangeEvent, EditorAdapter } from "../mount/adapter.js";
import {
  applyChanges,
  eolSignature,
  stripWs,
  type BufferState,
} from "./buffer-state.js";
import type { BufferChangeNotification } from "./buffer-manager.js";

export function handleChangeCore(
  probe: ProbeBus,
  adapter: EditorAdapter,
  st: BufferState,
  listeners: Array<(n: BufferChangeNotification) => void>,
  e: ContentChangeEvent,
): void {
  const changeProbe = probe.emit(
    "editor.buffer.change",
    {
      versionId: e.versionId,
      changes: e.changes.map((c) => ({ ...c })),
      forced: e.forced,
    },
    st.openProbe ? probe.ref(st.openProbe) : null,
  );
  const changeRef = probe.ref(changeProbe);

  const classification: "user" | "programmatic" | "silent" =
    e.origin === "user" ? "user" : e.origin === "programmatic" ? "programmatic" : "silent";

  probe.emit(
    "editor.buffer.mutation.classify",
    {
      versionId: e.versionId,
      classification,
      cause:
        e.origin === "user"
          ? "user keystroke/paste via editor input"
          : e.origin === "programmatic"
            ? "explicit applyProgrammaticEdit API call"
            : "no user or API cause traceable — silent rewrite",
    },
    changeRef,
  );

  if (classification === "silent") {
    st.silentCount++;
    const before = st.prevAdapterText;
    const after = adapter.getText();
    probe.emit(
      "editor.buffer.mutation.silent",
      {
        versionId: e.versionId,
        changes: e.changes.map((c) => ({ ...c })),
        whitespaceChanged: stripWs(before) === stripWs(after) && before !== after,
        eolChanged: eolSignature(before) !== eolSignature(after),
        encodingChanged: false,
      },
      changeRef,
    );
    // expectedText intentionally NOT updated: the roundtrip check will
    // expose the divergence (buffer.roundtrip.fail).
  } else {
    // Reported changes apply to what the ADAPTER previously held — not to
    // expectedText, which deliberately lags after a silent rewrite (review
    // finding: applying an honest undo to the lagging base produced a false
    // second silent alarm). The cross-check below still catches an adapter
    // whose text diverges from the changes it reported.
    const applied = applyChanges(st.prevAdapterText, e.changes);
    if (applied !== adapter.getText()) {
      probe.emit(
        "editor.buffer.mutation.silent",
        {
          versionId: e.versionId,
          changes: e.changes.map((c) => ({ ...c })),
          whitespaceChanged: true,
          eolChanged: eolSignature(applied) !== eolSignature(adapter.getText()),
          encodingChanged: false,
          note: "adapter text diverged from reported changes — hidden extra mutation",
        },
        changeRef,
      );
      st.silentCount++;
    }
    st.expectedText = applied;
    st.legitEditsApplied = true;
  }

  st.prevAdapterText = adapter.getText();
  for (const l of [...listeners]) {
    l({ event: e, classification, changeProbe });
  }
}
