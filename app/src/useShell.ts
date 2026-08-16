/**
 * useShell (SUB200 split of App.tsx — no behavior change): composes the
 * shell's construction hooks in one FIXED order — transports → singletons →
 * prefs → data pipeline → ui state/interactions → flows → derived render
 * facts — and returns the single shell context every subcomponent reads.
 * App.tsx stays the facade component.
 */

import { useState, useSyncExternalStore } from "react";
import { loadPrefs, type Prefs } from "./prefs";
import type { ConfirmFn } from "./tabsStore";
import {
  DEFAULT_AI_BASE, DEFAULT_HUB_BASE, useShellSingletons, useTransports,
  type AppProps,
} from "./appCore";
import { useAppData } from "./useAppData";
import { useAppUi } from "./useAppUi";
import { useAppFlows } from "./useAppFlows";
import { useFileFlows } from "./useFileFlows";
import { useAppDerived } from "./useAppDerived";

export function useShell(props: AppProps) {
  const hubBase = props.hubBase ?? DEFAULT_HUB_BASE;
  const aiBase = props.aiBase ?? DEFAULT_AI_BASE;
  const disableEditor = props.disableEditor === true;
  const { httpDo, httpGet } = useTransports(props);
  const { bus, tabs } = useShellSingletons();
  const tabsSnap = useSyncExternalStore(tabs.subscribe, tabs.getSnapshot);
  const confirmFn: ConfirmFn = props.confirmFn ?? ((msg) => window.confirm(msg));
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());

  const data = useAppData({ hubBase, httpGet, httpDo, bus, prefs });
  const ui = useAppUi(bus, data.refreshAll);
  const flows = useAppFlows({
    hubBase, httpDo, tabs, prefs,
    workspace: data.workspace, workspaceFailure: data.workspaceFailure,
    pushBanner: data.pushBanner, refreshAll: data.refreshAll,
    editorApi: ui.editorApi, openWindow: ui.openWindow, setDialog: ui.setDialog,
    canvasRef: ui.canvasRef,
  });
  const fileFlows = useFileFlows({
    hubBase, httpDo, tabs, confirmFn,
    phase: data.phase, workspace: data.workspace, workspaceFailure: data.workspaceFailure,
    pushBanner: data.pushBanner, openWindow: ui.openWindow, setDialog: ui.setDialog,
    setRecents: ui.setRecents, runAnalyze: flows.runAnalyze,
  });
  const derived = useAppDerived({
    disableEditor, hubBase, tabsSnap, prefs,
    layout: ui.layout, projectOpen: ui.projectOpen,
    selectedNodeId: ui.selectedNodeId, editorStatus: ui.editorStatus,
    served: data.served, wall: data.wall, analysisState: data.analysisState,
    workspace: data.workspace, health: data.health,
  });

  return {
    hubBase, aiBase, disableEditor, httpDo, httpGet, bus, tabs, tabsSnap,
    confirmFn, prefs, setPrefs,
    ...data, ...ui, ...flows, ...fileFlows, ...derived,
  };
}

/** The single shell context — inferred, never restated by hand. */
export type ShellCtx = ReturnType<typeof useShell>;
