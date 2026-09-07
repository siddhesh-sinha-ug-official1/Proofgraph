/**
 * App core (SUB200 split of App.tsx — no behavior change): the shell's public
 * constants + props, the banner/analysis/dialog state shapes, the served-bytes
 * export helper, and the two construction hooks (transport seams; the joined
 * bus + tab store singletons with their §7.8 spike surfaces). App.tsx stays
 * the facade component with the shell's full design doc.
 */

import { useMemo, useRef } from "react";
import { GraphSourceError, type HttpGet } from "./graphSource";
import { defaultHttpDo, type HttpDo } from "./fsSource";
import { createJoinedBus, type JoinedBus } from "./busAdapter";
import { TabsStore, type ConfirmFn } from "./tabsStore";
import { probeShell } from "./shellLog";
import type { SettingsPage } from "./SettingsDialog";

export const DEFAULT_HUB_BASE = "http://127.0.0.1:8477";
export const DEFAULT_AI_BASE = "http://127.0.0.1:8478";

export interface AppProps {
  hubBase?: string;
  aiBase?: string;
  /** test seam: injected GET transport for /graph, /graph/truth, /analysis (+ shell GETs) */
  httpGet?: HttpGet;
  /** test seam: injected full transport (GET/PUT/POST) for the workspace-fs endpoints */
  httpDo?: HttpDo;
  /** test seam: jsdom cannot host Monaco; the shell + banners are testable without it */
  disableEditor?: boolean;
  /** test seam: the unsaved-close guard's confirm (defaults to window.confirm) */
  confirmFn?: ConfirmFn;
}

export interface Banner {
  severity: "error" | "warn" | "info";
  failureClass: string;
  detail: string;
}

export type AnalysisState =
  | { kind: "applied"; applied: number; unverdicted: number }
  | { kind: "pending"; failureClass: string; detail: string }
  | { kind: "failed"; failureClass: string; detail: string };

export type DialogState =
  | null | { kind: "openFolder" } | { kind: "openFile" } | { kind: "rootPicker" }
  | { kind: "prefs"; page?: SettingsPage } | { kind: "about" } | { kind: "gapReport" }
  | { kind: "search" };

export interface ServedNode {
  id: string;
  name: string;
  kind: string;
  span?: { file: string; byteStart: number; byteEnd: number };
}

/** SERVED bytes → client download. Export never re-serializes (contract). */
export function downloadServedBytes(name: string, bytes: Uint8Array): boolean {
  try {
    // TS resolves Uint8Array.buffer as ArrayBufferLike (includes SharedArrayBuffer);
    // Blob() requires ArrayBuffer — new Uint8Array() narrows the backing buffer type.
    const buf = new Uint8Array(bytes) as { buffer: ArrayBuffer };
    const blob = new Blob([buf.buffer], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    probeShell("shell.export.failed", { name, reason: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** Transports: one injectable seam, both shapes derived from it. */
export function useTransports(props: AppProps): { httpDo: HttpDo; httpGet: HttpGet } {
  const httpDo: HttpDo = useMemo(() => {
    if (props.httpDo !== undefined) return props.httpDo;
    if (props.httpGet !== undefined) {
      const get = props.httpGet;
      return async (method, url, body) => {
        if (method === "GET") return get(url);
        void body;
        throw new GraphSourceError("hub-unreachable",
          `injected GET-only test transport cannot ${method} ${url}`);
      };
    }
    return defaultHttpDo;
  }, [props.httpDo, props.httpGet]);
  const httpGet: HttpGet = useMemo(
    () => props.httpGet ?? (async (url) => httpDo("GET", url)),
    [props.httpGet, httpDo],
  );
  return { httpDo, httpGet };
}

/** The joined bus + tab store — one per shell, both console-inspectable
 *  (§7.8 discipline, same move as pgEditorWall/pgGraphWall). */
export function useShellSingletons(): { bus: JoinedBus; tabs: TabsStore } {
  const busRef = useRef<JoinedBus | null>(null);
  if (busRef.current === null) {
    busRef.current = createJoinedBus();
    (window as unknown as { pgShellBus: JoinedBus }).pgShellBus = busRef.current; // spike surface
  }
  const tabsRef = useRef<TabsStore | null>(null);
  if (tabsRef.current === null) {
    tabsRef.current = new TabsStore();
    // spike surface (§7.8 discipline, same move as pgEditorWall/pgGraphWall):
    // the tab store is inspectable/drivable from the console + the face suite.
    (window as unknown as { pgShellTabs: TabsStore }).pgShellTabs = tabsRef.current;
  }
  return { bus: busRef.current, tabs: tabsRef.current };
}
