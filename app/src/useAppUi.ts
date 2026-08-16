/**
 * The shell's UI state + canvas interactions (SUB200 split of App.tsx — no
 * behavior change): window layout (pgshell.layout.v2), recents, dialogs,
 * selection (the V5 joined bus, both origins through ONE subscription),
 * canvas measurement, auto-hide, node double-click reveal, zoom-to-fit and
 * project open/close. App.tsx stays the facade component.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { probeShell } from "./shellLog";
import { loadRecents, type RecentEntry } from "./prefs";
import {
  autoHideTransients, dockInsets, loadLayoutV2, saveLayoutV2, toggleWin,
  type LayoutV2, type WinId,
} from "./layout2";
import type { JoinedBus } from "./busAdapter";
import type { EditorApi, EditorPaneStatus } from "./EditorPane";
import type { DiagnosticRow } from "./BottomDock";
import type { DialogState } from "./appCore";

export function useAppUi(bus: JoinedBus, refreshAll: (cause: string) => void) {
  const [layout, setLayout] = useState<LayoutV2>(() => loadLayoutV2());
  const [recents, setRecents] = useState<RecentEntry[]>(() => loadRecents());
  const [barOn, setBarOn] = useState(false);
  const [projectOpen, setProjectOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const [transientCloseTick, setTransientCloseTick] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [graphViewKey, setGraphViewKey] = useState(0);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 1200, h: 800 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<EditorPaneStatus | null>(null);
  const [editorApi, setEditorApi] = useState<EditorApi | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticRow[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);

  // selected nodeId — the V5 joined bus, both origins (graph→editor injections
  // travel through editorSide.emit, so ONE subscription sees every selection).
  useEffect(() => bus.editorSide.subscribe((e) => {
    if (e.type === "node.select") setSelectedNodeId(e.nodeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // canvas measurement (the window layer's coordinate space)
  useEffect(() => {
    const el = canvasRef.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r !== undefined && r.width > 0 && r.height > 0) setCanvasSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [projectOpen]);

  const commitLayout = useCallback((next: LayoutV2, cause: string): void => {
    setLayout(saveLayoutV2(next, cause)); // persisted + probed (pgshell.layout.v2)
  }, []);

  const openWindow = useCallback((id: WinId, cause: string): void => {
    setLayout((l) => (l.wins[id].open ? l : saveLayoutV2(toggleWin(l, id, cause), cause)));
  }, []);

  const zoomToFit = useCallback((): void => {
    probeShell("shell.graph.zoom-to-fit", {
      note: "GraphView remount — React Flow fitView runs on mount inside the dock-inset host; the wall cell (and its pins) survives",
      insets: dockInsets(layout),
    });
    setGraphViewKey((k) => k + 1);
  }, [layout]);

  const closeProject = useCallback((): void => {
    probeShell("shell.project.close", { note: "Close project → welcome screen; the hub keeps serving — reopen refetches" });
    setProjectOpen(false);
    setDialog(null);
  }, []);

  const openSample = useCallback((): void => {
    setProjectOpen(true);
    refreshAll("welcome › open sample workspace (the hub workspace flow)");
  }, [refreshAll]);

  // ── canvas interactions (auto-hide + node double-click reveal) ────────────
  const onCanvasPointerDown = useCallback((e: React.PointerEvent): void => {
    // pointer-downs INSIDE tool windows / overlays must not auto-hide them
    const t = e.target as HTMLElement;
    if (t.closest(".tw") !== null || t.closest(".tw-gear-popup") !== null || t.closest(".canvas-overlay") !== null) return;
    setTransientCloseTick((n) => n + 1); // closes gear + header popups
    setLayout((l) => {
      const { layout: next, closed } = autoHideTransients(l);
      return closed.length > 0 ? saveLayoutV2(next, `canvas auto-hide (${closed.join(", ")})`) : l;
    });
  }, []);

  const onCanvasDoubleClick = useCallback((e: React.MouseEvent): void => {
    const nodeEl = (e.target as HTMLElement).closest(".react-flow__node") as HTMLElement | null;
    if (nodeEl === null) return;
    const nodeId = nodeEl.getAttribute("data-id");
    if (nodeId === null) return;
    probeShell("shell.graph.node.dblclick", { nodeId, note: "reveal in the Editor window (opens it if hidden); selection rides the V5 bus" });
    openWindow("editor", `dblclick ${nodeId}`);
    bus.graphSide.emit({ type: "select", nodeId, source: "graph" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWindow]);

  return {
    layout, setLayout, commitLayout, openWindow, zoomToFit,
    recents, setRecents,
    barOn, setBarOn, projectOpen, setProjectOpen, legendOpen, setLegendOpen,
    transientCloseTick, dialog, setDialog, graphViewKey, canvasSize, canvasRef,
    selectedNodeId, setSelectedNodeId,
    editorStatus, setEditorStatus, editorApi, setEditorApi,
    diagnostics, setDiagnostics,
    closeProject, openSample, onCanvasPointerDown, onCanvasDoubleClick,
  };
}
