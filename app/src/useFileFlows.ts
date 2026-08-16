/**
 * The shell's file flows (SUB200 split of App.tsx — no behavior change):
 * open file (hub fs read → tab; already-open just activates), open folder
 * (server-side pick → POST /analyze {root} → full refresh), tab close (dirty
 * guard inside the store, probed) and the initial tab (hub fs when served;
 * bundled fixture as the honest fallback — save refused with the reason,
 * never silently written nowhere). App.tsx stays the facade component.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { GraphSourceError } from "./graphSource";
import { fsRead, type HttpDo, type WorkspaceInfo } from "./fsSource";
import { probeShell } from "./shellLog";
import { addRecent, type RecentEntry } from "./prefs";
import { languageIdFor, moatAbsDir, pyrightCanonicalUri } from "./uris";
import type { TabsStore, ConfirmFn } from "./tabsStore";
import type { WinId } from "./layout2";
import type { Banner, DialogState } from "./appCore";

import coreSrc from "../../acceptance/fixtures/moatpkg/core.py?raw";

export interface FileFlowsArgs {
  hubBase: string;
  httpDo: HttpDo;
  tabs: TabsStore;
  confirmFn: ConfirmFn;
  phase: "loading" | "ready" | "failed";
  workspace: WorkspaceInfo | null;
  workspaceFailure: { failureClass: string; detail: string } | null;
  pushBanner: (b: Banner) => void;
  openWindow: (id: WinId, cause: string) => void;
  setDialog: (d: DialogState) => void;
  setRecents: React.Dispatch<React.SetStateAction<RecentEntry[]>>;
  runAnalyze: (req: { root?: string; roots?: string[] }, cause: string) => Promise<boolean>;
}

export function useFileFlows(a: FileFlowsArgs) {
  const {
    hubBase, httpDo, tabs, confirmFn, phase, workspace, workspaceFailure,
    pushBanner, openWindow, setDialog, setRecents, runAnalyze,
  } = a;

  const openFile = useCallback(async (relPath: string): Promise<void> => {
    if (workspace === null) {
      pushBanner({
        severity: "warn", failureClass: workspaceFailure?.failureClass ?? "workspace-not-open",
        detail: `cannot open ${relPath}: hub /workspace + /fs endpoints unavailable`,
      });
      return;
    }
    // switching tabs off a dirty buffer is safe (buffers cached per tab);
    // opening an ALREADY-OPEN tab just activates it.
    try {
      const existing = tabs.find(relPath);
      if (existing !== undefined) {
        tabs.activate(relPath);
      } else {
        const f = await fsRead(hubBase, relPath, httpDo);
        tabs.open({
          relPath, uri: pyrightCanonicalUri(workspace.root, relPath),
          languageId: languageIdFor(relPath),
          savedContent: f.content, sha256: f.sha256, readOnlyReason: null,
        });
        probeShell("shell.file.open", { relPath, source: "hub-fs", sha256: f.sha256 });
      }
      setRecents((r) => addRecent(r, "file", relPath));
      openWindow("editor", `open ${relPath}`); // a file open reveals the Editor window
      setDialog(null);
    } catch (e) {
      const fc = e instanceof GraphSourceError ? e.failureClass : "hub-unreachable";
      pushBanner({ severity: "error", failureClass: fc, detail: e instanceof Error ? e.message : String(e) });
    }
  }, [workspace, workspaceFailure, tabs, hubBase, httpDo, pushBanner, openWindow, setRecents, setDialog]);

  const openFolder = useCallback(async (relPath: string): Promise<void> => {
    setDialog(null);
    setRecents((r) => addRecent(r, "folder", relPath));
    probeShell("shell.folder.open", { relPath, note: "server-side pick → POST /analyze {root} → full refresh" });
    await runAnalyze({ root: relPath }, `open folder ${relPath || "(workspace root)"}`);
  }, [runAnalyze, setDialog, setRecents]);

  const closeTab = useCallback((relPath: string): void => {
    tabs.requestClose(relPath, confirmFn); // dirty guard inside (probed)
  }, [tabs, confirmFn]);

  // ── workspace-root change → invalidate open tabs (pre-GitHub round R3) ────
  // Open Folder re-declares the hub workspace; open tabs' relPaths refer to
  // files in the PREVIOUS workspace, so a subsequent save would either 404 or
  // land bytes at the wrong relpath in the new jail.  Close them: dirty tabs
  // go through the existing unsaved-close guard (user consent preserved —
  // "no silent data loss"), clean tabs close silently, everything probed.
  const prevWorkspaceRoot = useRef<string | null>(null);
  useEffect(() => {
    if (workspace === null) return;
    const prev = prevWorkspaceRoot.current;
    prevWorkspaceRoot.current = workspace.root;
    if (prev === null || prev === workspace.root) return;
    const paths = tabs.getSnapshot().tabs.map((t) => t.relPath);
    probeShell("shell.workspace.changed", {
      from: prev, to: workspace.root, tabsToClose: paths,
      note: "workspace root changed — closing tabs whose relPaths belong to the previous workspace (dirty guarded)",
    });
    for (const p of paths) tabs.requestClose(p, confirmFn);
  }, [workspace, tabs, confirmFn]);

  // ── initial tab (hub fs when served; bundled fixture as the honest fallback)
  const initialTabOpened = useRef(false);
  useEffect(() => {
    if (initialTabOpened.current || phase !== "ready") return;
    if (workspace === null && workspaceFailure === null) return; // still probing /workspace
    initialTabOpened.current = true;
    (async () => {
      const relPath = "moatpkg/core.py";
      if (workspace !== null) {
        try {
          const f = await fsRead(hubBase, relPath, httpDo);
          tabs.open({
            relPath, uri: pyrightCanonicalUri(workspace.root, relPath),
            languageId: languageIdFor(relPath),
            savedContent: f.content, sha256: f.sha256, readOnlyReason: null,
          });
          probeShell("shell.file.open", { relPath, source: "hub-fs", sha256: f.sha256 });
          return;
        } catch (e) {
          probeShell("shell.file.open.failed", {
            relPath, failureClass: e instanceof GraphSourceError ? e.failureClass : "hub-unreachable",
          });
        }
      }
      // FALLBACK (declared, probed): the bundled acceptance fixture — save is
      // refused with this reason, never silently written nowhere.
      tabs.open({
        relPath, uri: pyrightCanonicalUri(moatAbsDir(), "core.py"),
        languageId: "python", savedContent: coreSrc, sha256: null,
        readOnlyReason: "bundled fixture (hub /fs endpoints unavailable) — PUT /fs/file has nowhere to write",
      });
      probeShell("shell.file.open", { relPath, source: "bundled-fixture" });
    })();
  }, [phase, workspace, workspaceFailure, hubBase, httpDo, tabs]);

  return { openFile, openFolder, closeTab };
}
