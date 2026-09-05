/**
 * useElectronIntegration — wires Electron menu actions and native dialogs
 * to the shell's existing action handlers.
 *
 * When running in a browser (dev server), this hook is a no-op.
 * When running inside Electron, it:
 *   - Subscribes to menu:action IPC (File → Open Folder, Save, etc.)
 *   - Provides openFolderNative() and openFileNative() that show native
 *     OS dialogs and then call the shell's openFolder/openFile/runAnalyze.
 */
import { useEffect, useCallback, useState } from "react";
import { getBridge, isElectron, pickFolder, pickFile } from "./electronBridge";
import { probeShell } from "./shellLog";
import type { Banner, DialogState } from "./appCore";

export interface ElectronIntegrationArgs {
  openFolder: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  runAnalyze: (req: { root?: string }, cause: string) => Promise<boolean>;
  closeProject: () => void;
  saveActive: (cause: string) => void;
  setProjectOpen: (open: boolean) => void;
  setDialog: (d: DialogState) => void;
  pushBanner: (b: Banner) => void;
}

export function useElectronIntegration(a: ElectronIntegrationArgs) {
  const {
    openFolder, openFile, runAnalyze, closeProject,
    saveActive, setProjectOpen, setDialog, pushBanner,
  } = a;

  const [pythonStatus, setPythonStatus] = useState<{
    available: boolean; version: string | null;
  } | null>(null);

  // ── Native folder picker → POST /analyze ──────────────────────────
  const openFolderNative = useCallback(async (): Promise<void> => {
    const folderPath = await pickFolder();
    if (!folderPath) return; // user cancelled
    probeShell("shell.electron.openFolder", { path: folderPath });
    setProjectOpen(true);
    await runAnalyze({ root: folderPath }, `native folder picker: ${folderPath}`);
  }, [runAnalyze, setProjectOpen]);

  // ── Native file picker → open in editor ────────────────────────────
  const openFileNative = useCallback(async (): Promise<void> => {
    const filePath = await pickFile();
    if (!filePath) return;
    probeShell("shell.electron.openFile", { path: filePath });
    setProjectOpen(true);
    await openFile(filePath);
  }, [openFile, setProjectOpen]);

  // ── Menu → renderer action dispatch ────────────────────────────────
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    const cleanup = bridge.onMenuAction((action: string) => {
      probeShell("shell.menu.action", { action });
      switch (action) {
        case "openFolder":
          void openFolderNative();
          break;
        case "openFile":
          void openFileNative();
          break;
        case "save":
          saveActive("menu: File > Save");
          break;
        case "analyze":
          void runAnalyze({}, "menu: Run Analysis");
          break;
        case "closeProject":
          closeProject();
          break;
        case "search":
          setDialog({ kind: "search" });
          break;
      }
    });

    return cleanup;
  }, [openFolderNative, openFileNative, saveActive, runAnalyze, closeProject, setDialog]);

  // ── Python availability check (desktop only, once) ──────────────────
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    bridge.checkPython().then((result) => {
      setPythonStatus({ available: result.available, version: result.version });
      probeShell("shell.electron.pythonCheck", result);
      if (!result.available) {
        pushBanner({
          severity: "warn",
          failureClass: "python-not-found",
          detail: "Python was not found on this system. The analysis hub needs Python 3.10+ to run. Install Python from python.org and restart ProofGraph.",
        });
      }
    }).catch(() => {
      // non-fatal — hub startup will surface its own error if Python is truly missing
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { openFolderNative, openFileNative, isDesktop: isElectron(), pythonStatus };
}
