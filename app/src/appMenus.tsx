/**
 * The shell's menu model (SUB200 split of App.tsx — no behavior change):
 * NO dead buttons — every item is enabled or carries its reason verbatim;
 * Import is OMITTED ENTIRELY per APP-SHELL-CONTRACT ("nothing imports");
 * exports write the SERVED bytes verbatim, never re-serialized; the outage
 * simulator is deliberately OUT (the chip reads the REAL /health). App.tsx
 * stays the facade component and hands this the shell context per render.
 */

import { type MenuSpec } from "./MenuBar";
import { probeShell } from "./shellLog";
import { setPref } from "./prefs";
import { resetLayoutV2, toggleWin, type WinId } from "./layout2";
import { downloadServedBytes } from "./appCore";
import type { ShellCtx } from "./useShell";
import { isDirty } from "./tabsStore";

export function buildMenus(s: ShellCtx): MenuSpec[] {
  const { activeTab, fsAvailable, workspaceFailure, analysisState, prefs, layout } = s;

  const saveEnabled = activeTab !== null && isDirty(activeTab) && activeTab.readOnlyReason === null && fsAvailable && !s.saving;
  const saveReason =
    activeTab === null ? "no file tab is open"
    : activeTab.readOnlyReason !== null ? activeTab.readOnlyReason
    : !fsAvailable ? `hub /fs endpoints unavailable (${workspaceFailure?.failureClass ?? "workspace-not-open"})`
    : !isDirty(activeTab) ? "no unsaved changes in the active tab"
    : "save already in flight";

  const editReason = s.disableEditor
    ? "editor disabled (test/headless mode)"
    : activeTab === null ? "no open editor tab"
    : "editor wall not mounted yet";

  const windowToggleItem = (id: WinId, label: string) => ({
    id: `toggle-${id}`, label, checked: layout.wins[id].open, enabled: true,
    onAction: () => s.commitLayout(toggleWin(layout, id, `View > ${label}`), `View > ${label}`),
  });

  return [
    {
      id: "file", label: "File",
      items: [
        {
          id: "open-folder", label: "Open folder…",
          enabled: fsAvailable,
          reason: `server-side browse needs hub /fs/list (${workspaceFailure?.failureClass ?? "probing /workspace"})`,
          onAction: () => s.setDialog({ kind: "openFolder" }),
        },
        {
          id: "open-file", label: "Open file…",
          enabled: fsAvailable,
          reason: `server-side browse needs hub /fs/list (${workspaceFailure?.failureClass ?? "probing /workspace"})`,
          onAction: () => s.setDialog({ kind: "openFile" }),
        },
        {
          id: "save", label: "Save", shortcut: "Ctrl+S",
          enabled: saveEnabled, reason: saveReason,
          onAction: () => void s.saveActive("File > Save"),
        },
        {
          id: "reanalyze", label: "Re-analyze", separatorBefore: true,
          enabled: !s.analyzing, reason: "an /analyze run is already in flight (pipeline-busy is the hub's own refusal too)",
          onAction: () => void s.runAnalyze({}, "File > Re-analyze"),
        },
        {
          id: "export-graph", label: "Export graph JSON",
          enabled: s.served !== null,
          reason: "no /graph envelope served yet — nothing to export (export writes the SERVED bytes verbatim)",
          onAction: () => {
            if (s.served !== null && downloadServedBytes("proofgraph-graph.json", s.served.bytes)) {
              probeShell("shell.export.graph", { bytes: s.served.bytes.length, note: "served bytes verbatim, never re-serialized" });
            }
          },
        },
        {
          id: "export-analysis", label: "Export analysis JSON",
          enabled: s.analysisExport !== null,
          reason: `no computed /analysis served (${analysisState?.kind === "pending" ? `pending: ${analysisState.failureClass}` : analysisState?.kind === "failed" ? `failed: ${analysisState.failureClass}` : "not fetched yet"}) — pending is never exported as green`,
          onAction: () => {
            if (s.analysisExport !== null && downloadServedBytes("proofgraph-analysis.json", s.analysisExport.bytes)) {
              probeShell("shell.export.analysis", { bytes: s.analysisExport.bytes.length, note: "served bytes verbatim, never re-serialized" });
            }
          },
        },
        ...(s.recents.length === 0
          ? [{
              id: "recents-empty", label: "(no recents yet)", separatorBefore: true,
              enabled: false, reason: "nothing opened yet in this browser profile (localStorage pgshell.recents.v1)",
            }]
          : s.recents.slice(0, 5).map((r, i) => ({
              id: `recent-${i}`, label: `${r.kind === "folder" ? "📁" : "·"} ${r.path || "(workspace root)"}`,
              separatorBefore: i === 0, enabled: fsAvailable,
              reason: `recents need the hub fs endpoints (${workspaceFailure?.failureClass ?? "unavailable"})`,
              onAction: () => { void (r.kind === "folder" ? s.openFolder(r.path) : s.openFile(r.path)); },
            }))),
        {
          id: "close-project", label: "Close project", separatorBefore: true, enabled: true,
          onAction: s.closeProject,
        },
        // Import: OMITTED ENTIRELY per APP-SHELL-CONTRACT ("nothing imports").
      ],
    },
    {
      id: "edit", label: "Edit",
      items: [
        { id: "undo", label: "Undo", shortcut: "Ctrl+Z", enabled: s.editorApi !== null, reason: editReason, onAction: () => s.editorApi?.undo() },
        { id: "redo", label: "Redo", shortcut: "Ctrl+Y", enabled: s.editorApi !== null, reason: editReason, onAction: () => s.editorApi?.redo() },
        { id: "find", label: "Find", shortcut: "Ctrl+F", separatorBefore: true, enabled: s.editorApi !== null, reason: editReason, onAction: () => s.editorApi?.find() },
        { id: "replace", label: "Replace", shortcut: "Ctrl+H", enabled: s.editorApi !== null, reason: editReason, onAction: () => s.editorApi?.replace() },
      ],
    },
    {
      id: "view", label: "View",
      items: [
        windowToggleItem("project", "Project window"),
        windowToggleItem("editor", "Editor window"),
        windowToggleItem("ai", "AI outlet window"),
        windowToggleItem("diag", "Diagnostics window"),
        windowToggleItem("pins", "Pins console window"),
        {
          id: "toggle-menubar", label: "Main menu bar", checked: s.barOn, enabled: true,
          onAction: () => { probeShell("shell.menubar.toggle", { on: !s.barOn }); s.setBarOn((b) => !b); },
        },
        {
          id: "theme-light", label: "Light theme", separatorBefore: true, checked: prefs.theme === "light", enabled: true,
          onAction: () => s.setPrefs(setPref(prefs, "theme", "light")),
        },
        {
          id: "theme-dark", label: "Dark theme", checked: prefs.theme === "dark", enabled: true,
          onAction: () => s.setPrefs(setPref(prefs, "theme", "dark")),
        },
        {
          id: "zoom-fit", label: "Zoom graph to fit", separatorBefore: true,
          enabled: s.wall !== null,
          reason: "graph wall not mounted (no served envelope)",
          onAction: s.zoomToFit,
        },
        {
          id: "reset-layout", label: "Reset window layout", enabled: true,
          onAction: () => s.setLayout(resetLayoutV2()),
        },
        {
          id: "prefs", label: "Settings…", shortcut: "Ctrl+,", separatorBefore: true, enabled: true,
          onAction: () => s.setDialog({ kind: "prefs" }),
        },
      ],
    },
    {
      id: "analysis", label: "Analysis",
      items: [
        {
          id: "run-analyze", label: "Run analyze",
          enabled: !s.analyzing, reason: "an /analyze run is already in flight",
          onAction: () => void s.runAnalyze({}, "Analysis > Run analyze"),
        },
        {
          id: "choose-roots", label: "Choose declared roots…",
          enabled: s.phase !== "failed",
          reason: "hub unreachable — /fs/roots-candidates cannot answer",
          onAction: () => s.setDialog({ kind: "rootPicker" }),
        },
        {
          id: "pyright-live", label: "Pyright: live", separatorBefore: true, checked: prefs.pyrightMode === "live", enabled: true,
          onAction: () => s.setPrefs(setPref(prefs, "pyrightMode", "live")),
        },
        {
          id: "pyright-none", label: "Pyright: none (cross-module calls stay LEADS — honest)", checked: prefs.pyrightMode === "none", enabled: true,
          onAction: () => s.setPrefs(setPref(prefs, "pyrightMode", "none")),
        },
        {
          id: "gap-report", label: "Show gap report", separatorBefore: true,
          enabled: s.analysisExport !== null,
          reason: `gapAnalysis comes from the SERVED /analysis — ${analysisState?.kind === "pending" ? `pending (${analysisState.failureClass})` : "not served"}; the shell never recomputes it`,
          onAction: () => s.setDialog({ kind: "gapReport" }),
        },
      ],
    },
    {
      id: "help", label: "Help",
      items: [
        { id: "about", label: "About ProofGraph", enabled: true, onAction: () => s.setDialog({ kind: "about" }) },
        // Simulate hub outage: deliberately OUT — the chip reads the REAL
        // /health; a fake outage would lie about transport state (round log).
      ],
    },
  ];
}
