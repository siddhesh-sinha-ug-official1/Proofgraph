/**
 * The shell's dialog wiring (SUB200 split of App.tsx — no behavior change):
 * open folder/file (server-side browse), search everywhere, root picker
 * (declared, never inferred), settings, about (wall versions + MEASURED
 * tier), gap report (SERVED gapAnalysis only). App.tsx stays the facade.
 */

import React from "react";
import { WALL_VERSION as GRAPH_WALL_VERSION } from "@graph-view/src/wall";
import { WALL_VERSION as EDITOR_WALL_VERSION } from "@editor-shell/src/wall.js";
import { probeShell } from "./shellLog";
import SearchEverywhere from "./SearchEverywhere";
import SettingsDialog from "./SettingsDialog";
import {
  AboutDialog, GapReportDialog, OpenPathDialog, RootPickerDialog,
} from "./dialogs";
import type { ShellCtx } from "./useShell";

export function AppDialogs({ s }: { s: ShellCtx }): React.ReactElement | null {
  const { dialog, setDialog } = s;
  return (
    <>
      {dialog?.kind === "openFolder" && (
        <OpenPathDialog mode="folder" hubBase={s.hubBase} httpDo={s.httpDo}
          onPick={(p) => void s.openFolder(p)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "openFile" && (
        <OpenPathDialog mode="file" hubBase={s.hubBase} httpDo={s.httpDo}
          onPick={(p) => void s.openFile(p)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "search" && (
        <SearchEverywhere
          hubBase={s.hubBase} httpDo={s.httpDo}
          fsAvailable={s.fsAvailable}
          nodes={s.servedNodes.map((n) => ({ id: n.id, name: n.name }))}
          onOpenFile={(p) => void s.openFile(p)}
          onPickNode={(nodeId) => {
            probeShell("shell.search.pick-node", { nodeId, note: "node hit selects in the graph via the V5 bus" });
            s.bus.graphSide.emit({ type: "select", nodeId, source: "graph" });
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rootPicker" && (
        <RootPickerDialog hubBase={s.hubBase} httpDo={s.httpDo}
          currentDeclaredRoots={s.workspace?.declaredRoots ?? []}
          onApply={(roots) => { setDialog(null); void s.runAnalyze({ roots }, "root picker (declared)"); }}
          onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "prefs" && (
        <SettingsDialog prefs={s.prefs} onPrefs={s.setPrefs} onClose={() => setDialog(null)}
          initialPage={dialog.page} pieces={s.pieces} />
      )}
      {dialog?.kind === "about" && (
        <AboutDialog
          schemaPin={s.health?.schemaPin ?? null}
          wallVersions={{
            ...(s.health?.wallVersions ?? {}),
            "editor-shell": EDITOR_WALL_VERSION,
            "graph-view": GRAPH_WALL_VERSION,
          }}
          measuredTier={s.editorStatus?.transport === "hub-lsp-ws" ? s.editorStatus.tier : null}
          transport={s.disableEditor ? "editor disabled (test mode)" : s.editorStatus?.transport ?? null}
          onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "gapReport" && s.analysisExport !== null && (
        <GapReportDialog gapAnalysis={s.analysisExport.gapAnalysis} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
