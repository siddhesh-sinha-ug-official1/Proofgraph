/**
 * The shell's render facts (SUB200 split of App.tsx — no behavior change):
 * ALL SOURCED — counts from the byte-gated served id sets, inspector paints
 * off the wall's own pins, breadcrumbs from served /workspace + tabs +
 * selection, the composed-pieces inventory from GET /health + the two cell
 * wall versions, and the accent tint style. App.tsx stays the facade.
 */

import React, { useMemo } from "react";
import type { FetchedEnvelope } from "./graphSource";
import type { GraphViewWall } from "@graph-view/src/wall";
import { WALL_VERSION as GRAPH_WALL_VERSION } from "@graph-view/src/wall";
import { WALL_VERSION as EDITOR_WALL_VERSION } from "@editor-shell/src/wall.js";
import type { HealthInfo, WorkspaceInfo } from "./fsSource";
import { isDirty, type TabsStore } from "./tabsStore";
import { accentLineTint, accentTint, type Prefs } from "./prefs";
import { dockInsets, type LayoutV2 } from "./layout2";
import { spanFileMatches } from "./uris";
import type { ComposedPiece } from "./SettingsDialog";
import type { EditorPaneStatus } from "./EditorPane";
import type { AnalysisState, ServedNode } from "./appCore";

export interface AppDerivedArgs {
  disableEditor: boolean;
  hubBase: string;
  tabsSnap: ReturnType<TabsStore["getSnapshot"]>;
  prefs: Prefs;
  layout: LayoutV2;
  projectOpen: boolean;
  selectedNodeId: string | null;
  editorStatus: EditorPaneStatus | null;
  served: FetchedEnvelope | null;
  wall: GraphViewWall | null;
  analysisState: AnalysisState | null;
  workspace: WorkspaceInfo | null;
  health: HealthInfo | null;
}

export function useAppDerived(a: AppDerivedArgs) {
  const { tabsSnap, served, wall, selectedNodeId, analysisState, workspace, health } = a;

  const activeTab = tabsSnap.activePath === null ? null : tabsSnap.tabs.find((t) => t.relPath === tabsSnap.activePath) ?? null;
  const fsAvailable = workspace !== null;
  const dirtyPaths = useMemo(() => new Set(tabsSnap.tabs.filter((t) => isDirty(t)).map((t) => t.relPath)), [tabsSnap]);
  const openPaths = useMemo(() => new Set(tabsSnap.tabs.map((t) => t.relPath)), [tabsSnap]);

  const counts = served === null ? null : {
    nodes: served.idSets.nodes.length, edges: served.idSets.edges.length, leads: served.idSets.leads.length,
  };

  const diagnosticsNote = a.disableEditor
    ? "editor disabled (test/headless mode) — no LSP stream exists"
    : a.editorStatus?.transport === "hub-lsp-ws"
      ? "live pyright over the hub WS bridge — rows read VERBATIM off the cell's editor.lsp.in.diagnostics pin"
      : "stub floor (tier G): no live diagnostics are CLAIMED — an empty list here is the honest state";

  const servedNodes: ServedNode[] = useMemo(() => {
    if (served === null) return [];
    return (served.envelope.nodes as unknown as ServedNode[]).map((n) => n);
  }, [served]);

  const inspNode = selectedNodeId === null ? null : servedNodes.find((n) => n.id === selectedNodeId) ?? null;
  const inspPaint = useMemo(() => {
    if (wall === null || selectedNodeId === null) return null;
    try {
      const paints = wall.pins.dump().paints as Record<string, {
        fillStatus: string; fillColor: string; fillHatched: boolean;
        outlineStatus: string; outlineColor: string; outlineWasNull: boolean;
      }>;
      return paints[selectedNodeId] ?? null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall, selectedNodeId, analysisState]);

  const breadcrumbs: string[] = useMemo(() => {
    if (!a.projectOpen) return [];
    const crumbs: string[] = [];
    if (workspace !== null) {
      const seg = workspace.root.replace(/\\/g, "/").split("/").filter((s) => s !== "");
      crumbs.push(seg[seg.length - 1] ?? workspace.root);
    }
    if (tabsSnap.activePath !== null) crumbs.push(...tabsSnap.activePath.split("/"));
    if (inspNode !== null && tabsSnap.activePath !== null && inspNode.span !== undefined
        && spanFileMatches(inspNode.span.file, tabsSnap.activePath)) {
      crumbs.push(inspNode.name.split(".").pop() ?? inspNode.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return crumbs;
  }, [a.projectOpen, workspace, tabsSnap.activePath, inspNode]);

  const hubPort = useMemo(() => {
    try { return new URL(a.hubBase).port || "80"; } catch { return "?"; }
  }, [a.hubBase]);

  const pieces: ComposedPiece[] = useMemo(() => {
    const served2: ComposedPiece[] = Object.entries(health?.wallVersions ?? {})
      .filter(([k]) => k !== "editor-shell" && k !== "graph-view")
      .map(([name, version]) => ({ name, version, role: "hub-composed cell wall (version from GET /health — never hardcoded)" }));
    return [
      ...served2,
      { name: "editor-shell", version: EDITOR_WALL_VERSION, role: "cell 4 — Monaco behind the wall (one document per instance)" },
      { name: "graph-view", version: GRAPH_WALL_VERSION, role: "cell 5 — React Flow behind the wall (canonical verdict paints)" },
      { name: "hub", version: health !== null ? `schema ${health.schemaPin?.schemaVersion ?? "?"}` : null, role: "python hub — /graph · /analysis · workspace fs (path-jailed)" },
      { name: "ai-server", version: null, role: "node ai outlet (:8478) — keys stay in ITS process, never the browser" },
    ];
  }, [health]);

  const ins = dockInsets(a.layout);

  const accStyle = {
    "--acc": a.prefs.accentColor,
    "--sel": accentTint(a.prefs.accentColor, a.prefs.theme),
    "--lnhl": accentLineTint(a.prefs.accentColor, a.prefs.theme),
  } as React.CSSProperties;

  return {
    activeTab, fsAvailable, dirtyPaths, openPaths, counts, diagnosticsNote,
    servedNodes, inspNode, inspPaint, breadcrumbs, hubPort, pieces, ins, accStyle,
  };
}
