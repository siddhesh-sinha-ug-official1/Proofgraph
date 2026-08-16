/**
 * The shell's data pipeline (SUB200 split of App.tsx — no behavior change):
 * graph gate → analysis overlay → wall mount → shell facts (/health +
 * /workspace), plus the banner region state, the refresh trigger and the hub
 * chip re-probe. Every hub failure renders its NAMED class — never blank.
 * App.tsx stays the facade component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGraphVerified, GraphSourceError, type FetchedEnvelope, type HttpGet } from "./graphSource";
import { fetchAnalysis, overlayVerdicts } from "./analysisSource";
import { createGraphViewWall, type GraphViewWall } from "@graph-view/src/wall";
import { fetchHealth, fetchWorkspace, type HealthInfo, type HttpDo, type WorkspaceInfo } from "./fsSource";
import { probeShell } from "./shellLog";
import type { JoinedBus } from "./busAdapter";
import type { Prefs } from "./prefs";
import type { AnalysisState, Banner } from "./appCore";

export interface AppDataArgs {
  hubBase: string;
  httpGet: HttpGet;
  httpDo: HttpDo;
  bus: JoinedBus;
  prefs: Prefs;
}

export function useAppData({ hubBase, httpGet, httpDo, bus, prefs }: AppDataArgs) {
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [banners, setBanners] = useState<Banner[]>([]);
  const [wall, setWall] = useState<GraphViewWall | null>(null);
  const [served, setServed] = useState<FetchedEnvelope | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState | null>(null);
  const [analysisExport, setAnalysisExport] = useState<{ bytes: Uint8Array; gapAnalysis: Record<string, unknown> } | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [workspaceFailure, setWorkspaceFailure] = useState<{ failureClass: string; detail: string } | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [explorerRefresh, setExplorerRefresh] = useState(0);
  const wallLive = useRef<GraphViewWall | null>(null);

  const pushBanner = useCallback((b: Banner): void => {
    setBanners((prev) => [...prev.slice(-4), b]); // bounded banner region (tail 5)
  }, []);

  // ── the load pipeline (graph gate → analysis overlay → wall → workspace) ──
  useEffect(() => {
    let disposed = false;
    (async () => {
      setPhase("loading");
      setBanners([]);
      try {
        // 1) the byte-gated envelope (V4's three-way serializer-edge-drop gate)
        const { served: servedEnv } = await fetchGraphVerified(hubBase, httpGet);
        if (disposed) return;
        setServed(servedEnv);

        // 2) the outer wall's verdict projection (contract shape; pending is honest)
        let envelope = servedEnv.envelope;
        try {
          const a = await fetchAnalysis(hubBase, httpGet);
          if (a.status === "ok") {
            const overlaid = overlayVerdicts(envelope, a.analysis.verdicts);
            envelope = overlaid.envelope;
            setAnalysisState({ kind: "applied", applied: overlaid.applied.length, unverdicted: overlaid.unverdicted.length });
            setAnalysisExport({ bytes: a.bytes, gapAnalysis: a.analysis.gapAnalysis });
          } else {
            setAnalysisState({ kind: "pending", failureClass: a.failureClass, detail: a.detail });
            setAnalysisExport(null);
            pushBanner({
              severity: "info", failureClass: a.failureClass,
              detail: `/analysis pending — rendering /graph as served (null outlines stay "not-yet-computed", never green): ${a.detail}`,
            });
          }
        } catch (e) {
          const fc = e instanceof GraphSourceError ? e.failureClass : "analysis-fetch-failed";
          const detail = e instanceof Error ? e.message : String(e);
          setAnalysisState({ kind: "failed", failureClass: fc, detail });
          setAnalysisExport(null);
          pushBanner({ severity: "warn", failureClass: fc, detail });
        }
        if (disposed) return;

        // 3) mount the graph-view WALL on the (possibly overlaid) envelope —
        // graph cap preference maps to the wall's PROBED capConfig (caps stay
        // probed + bannered by the cell, never silent).
        if (wallLive.current !== null) {
          try { wallLive.current.cell.controller.dispose(); } catch { /* already down */ }
          probeShell("shell.graph.dispose", { reason: "re-analyze / reload — new served envelope replaces the wall" });
          wallLive.current = null;
        }
        const w = await createGraphViewWall(
          structuredClone(envelope),
          bus.graphSide,
          prefs.graphMaxNodes !== null ? { capConfig: { maxNodes: prefs.graphMaxNodes } } : {},
        );
        if (disposed) return;
        wallLive.current = w;
        setWall(w);
        (window as unknown as { pgGraphWall: GraphViewWall }).pgGraphWall = w; // spike surface
        setPhase("ready");
      } catch (e) {
        const fc = e instanceof GraphSourceError ? e.failureClass : (e instanceof Error ? e.name : "unknown");
        pushBanner({
          severity: "error", failureClass: fc,
          detail: `${e instanceof Error ? e.message : String(e)} — start the hub: python hub/serve_app.py (HTTP 8477)`,
        });
        setPhase("failed");
      }

      // 4) shell facts — /health (schema pin, wall versions) + /workspace.
      // These are OPTIONAL surfaces: a hub without them renders the named
      // class in the OWNING region (status bar / explorer / hub chip), not a
      // page error.
      try {
        const h = await fetchHealth(hubBase, httpDo);
        if (!disposed) setHealth(h);
      } catch (e) {
        if (!disposed) setHealth(null);
        probeShell("shell.health.unavailable", {
          failureClass: e instanceof GraphSourceError ? e.failureClass : "hub-unreachable",
        });
      }
      try {
        const ws = await fetchWorkspace(hubBase, httpDo);
        if (!disposed) {
          setWorkspace(ws);
          setWorkspaceFailure(null);
        }
      } catch (e) {
        if (!disposed) {
          setWorkspace(null);
          setWorkspaceFailure({
            failureClass: e instanceof GraphSourceError ? e.failureClass : "hub-unreachable",
            detail: `hub /workspace unavailable (HUB-workspace-fs endpoints not live on this hub) — explorer and file ops are disabled with this reason; the bundled moatpkg fixture backs the editor`,
          });
        }
      }
    })();
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubBase, reloadToken]);

  // dispose the graph wall with the shell
  useEffect(() => () => {
    try { wallLive.current?.cell.controller.dispose(); } catch { /* already down */ }
    wallLive.current = null;
  }, []);

  const refreshAll = useCallback((cause: string): void => {
    probeShell("shell.refresh", { cause, note: "refetch /graph + /analysis + /workspace + explorer + status" });
    setReloadToken((t) => t + 1);
    setExplorerRefresh((t) => t + 1);
  }, []);

  const refreshHubChip = useCallback((): void => {
    (async () => {
      try {
        const h = await fetchHealth(hubBase, httpDo);
        setHealth(h);
        probeShell("shell.hub.chip", { ok: true, note: "GET /health re-probed from the transport chip" });
      } catch (e) {
        setHealth(null);
        const fc = e instanceof GraphSourceError ? e.failureClass : "hub-unreachable";
        probeShell("shell.hub.chip", { ok: false, failureClass: fc });
        pushBanner({ severity: "error", failureClass: fc, detail: `GET /health failed — start the hub: python hub/serve_app.py (HTTP 8477)` });
      }
    })();
  }, [hubBase, httpDo, pushBanner]);

  return {
    phase, banners, setBanners, pushBanner,
    wall, served, analysisState, analysisExport,
    workspace, workspaceFailure, health,
    explorerRefresh, refreshAll, refreshHubChip,
  };
}
