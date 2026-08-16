/**
 * UI-1C round — the GRAPH-FIRST shell (shell-design/README.md; windowing spec
 * of record: ProofGraphGraphFirst.dc.html, recreated — never copied):
 *
 *   ┌ header 42px: ☰ · logo · project switcher · [inline menubar] · analyze ┐
 *   │   split-button · search-everywhere · settings cog · hub /health chip  │
 *   ├ banner region (named failure classes — never a blank pane) ───────────┤
 *   ├──┬─────────────────────────────────────────────────────────────────────┤
 *   │r │ FULL-BLEED graph canvas (cell 5's wall under the window layer)      │
 *   │a │   overlays: stats pill · zoom cluster · legend chip · inspector     │
 *   │i │   five TOOL WINDOWS (project·editor·ai·diag·pins), each a WinState  │
 *   │  │   machine: dock pinned/unpinned · undock · float; drag-to-dock;     │
 *   │  │   gear menus; per-edge shared sizes (pgshell.layout.v2)             │
 *   ├──┴─────────────────────────────────────────────────────────────────────┤
 *   └ status bar 26px: breadcrumbs · pin · tier · N/E/L · analysis · sel ────┘
 *
 * Membrane rules unchanged from the app-shell round: the browser NEVER touches
 * the filesystem (every file op is a hub endpoint, path-jailed hub-side); the
 * proven feeding tubes are REUSED, not reinvented (graphSource's byte-gated
 * three-way /graph gate, analysisSource's contract-shape gate, the V5 joined
 * bus verbatim, cell 4's wall behind the editor window, cell 5's wall as the
 * canvas); every hub failure renders its NAMED class in a banner region —
 * never a blank pane; NO dead buttons (disabled items carry title="why";
 * Import is omitted ENTIRELY per contract — nothing imports); status-bar
 * facts come from PINS or served data, never hardcoded; every menu action,
 * pref change and dock/window mutation is probed on window.pgShellLog
 * (incl. shell.toolwindow.mode). VERDICT COLORS ARE CANONICAL — imported from
 * @graph-view/src/verdict + packages/schema/gen; the free accent drives --acc
 * only.
 *
 * SUB200 restructure: App stays the FACADE component. The pieces live in
 * appCore.ts (props/types/transports/singletons), useAppData.ts (load
 * pipeline), useAppUi.ts (layout/dialog/selection/canvas), useAppFlows.ts
 * (analyze/save/keyboard), useFileFlows.ts (open file/folder, tab close,
 * initial tab), useAppDerived.ts (render facts), useShell.ts (fixed-order
 * composition), appMenus.tsx (menu model), AppMain.tsx (canvas + overlays
 * + tool windows), EditorWindowBody.tsx, VerdictLegend.tsx and
 * AppDialogs.tsx. Public surface unchanged.
 */

import React from "react";
import "@xyflow/react/dist/style.css";

import Header from "./Header";
import Welcome from "./Welcome";
import StatusBar from "./StatusBar";
import { setPref } from "./prefs";
import type { SettingsPage } from "./SettingsDialog";
import { useShell } from "./useShell";
import { buildMenus } from "./appMenus";
import { AppMain } from "./AppMain";
import { AppDialogs } from "./AppDialogs";
import type { AppProps } from "./appCore";

export { DEFAULT_AI_BASE, DEFAULT_HUB_BASE } from "./appCore";
export type { AppProps } from "./appCore";

export default function App(props: AppProps): React.ReactElement {
  const s = useShell(props);
  const menus = buildMenus(s);

  return (
    <div className="app-root" data-theme={s.prefs.theme} style={s.accStyle}>
      <Header
        barOn={s.barOn}
        onToggleBar={() => s.setBarOn((b) => !b)}
        menus={menus}
        projectOpen={s.projectOpen}
        workspacePackage={s.workspace?.package ?? null}
        workspaceRoot={s.workspace?.root ?? null}
        recents={s.recents}
        onOpenRecent={(r) => { if (!s.projectOpen) s.setProjectOpen(true); void (r.kind === "folder" ? s.openFolder(r.path) : s.openFile(r.path)); }}
        onCloseProject={s.closeProject}
        analyzing={s.analyzing}
        analyzeEnabled={s.workspace !== null}
        analyzeReason={`hub /workspace unavailable (${s.workspaceFailure?.failureClass ?? "probing"}) — no pipeline root can be resolved`}
        declaredRoots={s.workspace?.declaredRoots ?? []}
        onAnalyze={() => void s.runAnalyze({}, "header analyze split-button")}
        onChooseRoots={() => s.setDialog({ kind: "rootPicker" })}
        onSearch={() => s.setDialog({ kind: "search" })}
        onSettings={(page) => s.setDialog({ kind: "prefs", page: (page as SettingsPage | undefined) })}
        theme={s.prefs.theme}
        onTheme={(t) => s.setPrefs(setPref(s.prefs, "theme", t))}
        hubPort={s.hubPort}
        hubOk={s.health !== null}
        onHubChip={s.refreshHubChip}
      />

      <div className="banner-region">
        {s.banners.map((b, i) => (
          <div key={i} className={`banner banner-${b.severity}`}>
            <b>{b.failureClass}</b>: {b.detail}
            <button
              type="button" className="banner-dismiss" aria-label={`dismiss ${b.failureClass} banner`}
              onClick={() => s.setBanners((prev) => prev.filter((_, j) => j !== i))}
            >✕</button>
          </div>
        ))}
        {s.editorStatus?.phase === "failed" && (
          <div className="banner banner-error"><b>editor-mount-failed</b>: {s.editorStatus.detail}</div>
        )}
      </div>

      {!s.projectOpen ? (
        <Welcome
          schemaPin={s.health?.schemaPin ?? null}
          recents={s.recents}
          onOpenSample={s.openSample}
          onOpenRecent={(r) => { s.setProjectOpen(true); void (r.kind === "folder" ? s.openFolder(r.path) : s.openFile(r.path)); }}
        />
      ) : (
        <AppMain s={s} />
      )}

      <StatusBar
        breadcrumbs={s.breadcrumbs}
        schemaPin={s.health?.schemaPin ?? null}
        editorStatus={s.editorStatus}
        editorDisabled={s.disableEditor}
        counts={s.counts}
        analysis={s.analysisState}
        selectedNodeId={s.selectedNodeId}
        dirtyCount={s.dirtyPaths.size}
      />

      <AppDialogs s={s} />
    </div>
  );
}
