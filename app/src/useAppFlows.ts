/**
 * The shell's analyze + save flows (SUB200 split of App.tsx — no behavior
 * change): analyze (Integrate-stage seam reconciliation AT THE HUB'S
 * VOCABULARY), save (hub PUT /fs/file, named refusals bannered, optional
 * auto-reanalyze) and the contract keyboard shortcuts. The file flows live
 * in useFileFlows.ts. App.tsx stays the facade component.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GraphSourceError } from "./graphSource";
import { fsWrite, postAnalyze, type HttpDo, type WorkspaceInfo } from "./fsSource";
import { probeShell } from "./shellLog";
import type { Prefs } from "./prefs";
import type { TabsStore } from "./tabsStore";
import type { EditorApi } from "./EditorPane";
import type { WinId } from "./layout2";
import type { Banner, DialogState } from "./appCore";

export interface AppFlowsArgs {
  hubBase: string;
  httpDo: HttpDo;
  tabs: TabsStore;
  prefs: Prefs;
  workspace: WorkspaceInfo | null;
  workspaceFailure: { failureClass: string; detail: string } | null;
  pushBanner: (b: Banner) => void;
  refreshAll: (cause: string) => void;
  editorApi: EditorApi | null;
  openWindow: (id: WinId, cause: string) => void;
  setDialog: (d: DialogState) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
}

export function useAppFlows(a: AppFlowsArgs) {
  const {
    hubBase, httpDo, tabs, prefs, workspace, workspaceFailure,
    pushBanner, refreshAll, editorApi, openWindow, setDialog, canvasRef,
  } = a;
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const analyzingRef = useRef(false);
  const savingRef = useRef(false);

  const runAnalyze = useCallback(async (req: { root?: string; roots?: string[] }, cause: string): Promise<boolean> => {
    if (analyzingRef.current) return false;
    // Integrate-stage seam reconciliation AT THE HUB'S VOCABULARY
    // (hub/server.py analyze() + REPORT-appshell-hubfs): POST /analyze
    // REQUIRES a hub-side 'root' path — a folder pick arrives here
    // workspace-RELATIVE (server-side browse) and is joined onto the served
    // /workspace root; a plain re-analyze reuses that root AND re-declares
    // its CURRENT declaredRoots (roots stay DECLARED — a re-run must never
    // silently lose them); the re-run config crosses as
    // extractorConfig{pyright_mode, python_package} (snake_case, hub-side).
    if (workspace === null) {
      const fc = workspaceFailure?.failureClass ?? "workspace-not-open";
      pushBanner({
        severity: "warn", failureClass: fc,
        detail: "cannot analyze: hub /workspace is unavailable, so no pipeline root can be resolved (start the hub with serve_app)",
      });
      probeShell("shell.analyze.blocked", { cause, failureClass: fc });
      return false;
    }
    analyzingRef.current = true;
    setAnalyzing(true);
    const sameRoot = req.root === undefined || req.root === "";
    // Native Electron dialog returns ABSOLUTE paths (C:\… or /home/…) which
    // must not be joined onto the workspace root. Browser-side folder picks
    // return workspace-relative paths that need the join.
    const isAbsolute = req.root !== undefined && (
      req.root.startsWith("/") || /^[A-Za-z]:[\\/]/.test(req.root)
    );
    const root = sameRoot ? workspace.root
      : isAbsolute ? req.root!
      : `${workspace.root}/${req.root}`;
    const roots = req.roots ?? (sameRoot ? workspace.declaredRoots : undefined);
    // sameRoot re-analyzes THIS workspace: reuse the workspace's known
    // pyrightMode so a hub launched with --pyright live is not silently
    // downgraded to prefs default 'none' on the first Ctrl+S auto-reanalyze
    // (pre-GitHub round R2 fix — mirrors the workspace.package reuse pattern
    // below). Cross-workspace (Open Folder → different root, no server-side
    // pyrightMode yet known): fall back to prefs.
    const wsPyright = workspace.pyrightMode;
    const useWsPyright = sameRoot && (wsPyright === "live" || wsPyright === "none");
    const body = {
      root,
      ...(roots !== undefined && roots.length > 0 ? { roots } : {}),
      extractorConfig: {
        pyright_mode: useWsPyright ? wsPyright : prefs.pyrightMode,
        // package name is a fact of THIS workspace — a different folder pick
        // gets none (the outer wall stages package dirs itself, never guesses)
        ...(sameRoot && workspace.package !== null ? { python_package: workspace.package } : {}),
      },
    };
    probeShell("shell.analyze.request", { cause, ...body });
    try {
      await postAnalyze(hubBase, body, httpDo);
      probeShell("shell.analyze.ok", { cause });
      refreshAll(`analyze (${cause})`);
      return true;
    } catch (e) {
      const fc = e instanceof GraphSourceError ? e.failureClass : "hub-unreachable";
      pushBanner({ severity: "error", failureClass: fc, detail: e instanceof Error ? e.message : String(e) });
      probeShell("shell.analyze.failed", { cause, failureClass: fc });
      return false;
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  }, [workspace, workspaceFailure, prefs.pyrightMode, hubBase, httpDo, refreshAll, pushBanner]);

  const saveActive = useCallback(async (cause: string): Promise<void> => {
    const t = tabs.active();
    if (t === null || savingRef.current) return;
    if (t.readOnlyReason !== null) {
      probeShell("shell.save.blocked", { relPath: t.relPath, reason: t.readOnlyReason, cause });
      pushBanner({ severity: "warn", failureClass: "save-refused", detail: `${t.relPath}: ${t.readOnlyReason}` });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const text = editorApi !== null ? editorApi.getText() : t.buffer;
    try {
      const { sha256 } = await fsWrite(hubBase, t.relPath, text, httpDo);
      tabs.markSaved(t.relPath, text, sha256);
      probeShell("shell.save.ok", {
        relPath: t.relPath, sha256, cause,
        note: "PUT /fs/file (hub path-jailed); LSP didChange was already pumped live by the cell on each edit",
      });
      if (prefs.autoReanalyzeOnSave) {
        void runAnalyze({}, "auto-reanalyze-on-save (preference)");
      }
    } catch (e) {
      // path-escape / workspace-not-open / fs-io-error … — the hub's NAMED
      // class renders in the banner region, never a silent failed save.
      const fc = e instanceof GraphSourceError ? e.failureClass : "hub-unreachable";
      pushBanner({ severity: "error", failureClass: fc, detail: e instanceof Error ? e.message : String(e) });
      probeShell("shell.save.failed", { relPath: t.relPath, failureClass: fc, cause });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [tabs, editorApi, hubBase, httpDo, prefs.autoReanalyzeOnSave, runAnalyze, pushBanner]);

  // ── keyboard (contract: Ctrl+S, Ctrl+, , Ctrl+Shift+E, Ctrl+Shift+G) ──────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "s" && !e.shiftKey) {
        e.preventDefault();
        probeShell("shell.key", { combo: "Ctrl+S", action: "save" });
        void saveActive("Ctrl+S");
      } else if (e.key === ",") {
        e.preventDefault();
        probeShell("shell.key", { combo: "Ctrl+,", action: "settings" });
        setDialog({ kind: "prefs" });
      } else if (k === "e" && e.shiftKey) {
        e.preventDefault();
        probeShell("shell.key", { combo: "Ctrl+Shift+E", action: "open project window" });
        openWindow("project", "Ctrl+Shift+E");
      } else if (k === "g" && e.shiftKey) {
        e.preventDefault();
        probeShell("shell.key", { combo: "Ctrl+Shift+G", action: "focus graph canvas" });
        canvasRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveActive, openWindow]);

  return { analyzing, saving, runAnalyze, saveActive };
}
