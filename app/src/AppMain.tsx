/**
 * The shell's main area (SUB200 split of App.tsx — no behavior change): rail
 * + FULL-BLEED graph canvas (cell 5's wall under the window layer) with the
 * sourced overlays — stats pill (byte-gated id-set counts), zoom cluster (the
 * cell owns its viewport; disabled buttons carry the reason), legend chip,
 * inspector (paints off the wall's own pins; reveal rides the V5 bus) — and
 * the five tool windows. App.tsx stays the facade component.
 */

import React from "react";
import { GraphView } from "@graph-view/src/GraphView";
import { HATCH_CSS } from "@graph-view/src/verdict";
import { probeShell } from "./shellLog";
import { toggleWin, type WinId } from "./layout2";
import { WindowLayer } from "./ToolWindows";
import Rail from "./Rail";
import Explorer from "./Explorer";
import AiPanel from "./AiPanel";
import { DiagnosticsList, PinsConsole } from "./BottomDock";
import { VerdictLegend } from "./VerdictLegend";
import { EditorWindowBody } from "./EditorWindowBody";
import type { ShellCtx } from "./useShell";

export function AppMain({ s }: { s: ShellCtx }): React.ReactElement {
  const { ins, counts, inspNode, inspPaint, layout } = s;

  const windowContent: Record<WinId, React.ReactNode> = {
    project: (
      <Explorer
        hubBase={s.hubBase} httpDo={s.httpDo}
        workspaceRoot={s.workspace?.root ?? null}
        workspaceFailure={s.workspaceFailure}
        dirtyPaths={s.dirtyPaths} openPaths={s.openPaths}
        activePath={s.tabsSnap.activePath}
        onOpenFile={(p) => void s.openFile(p)}
        refreshToken={s.explorerRefresh}
      />
    ),
    editor: <EditorWindowBody s={s} />,
    ai: <AiPanel aiBase={s.aiBase} />,
    diag: <DiagnosticsList rows={s.diagnostics} note={s.diagnosticsNote} />,
    pins: <PinsConsole hubBase={s.hubBase} httpDo={s.httpDo} />,
  };

  const windowMeta = {
    project: { title: "Project", sub: s.workspace?.root ?? "(workspace unserved)" },
    editor: { title: "Editor", sub: s.tabsSnap.activePath ?? "no file" },
    ai: { title: "AI Outlet", sub: "keys stay in the ai-server (:8478)" },
    diag: { title: "Diagnostics", sub: `${s.diagnostics.length} rows` },
    pins: { title: "Pins Console", sub: "hub + app-shell merged tail" },
  };

  return (
    <div className="main-area">
      <Rail
        layout={layout}
        onToggle={(id) => s.commitLayout(toggleWin(layout, id, `rail ${id}`), `rail ${id}`)}
        onSettings={() => s.setDialog({ kind: "prefs" })}
      />
      <div
        className="canvas-area" data-canvas="1" ref={s.canvasRef} tabIndex={-1}
        data-testid="graph-canvas"
        onPointerDown={s.onCanvasPointerDown}
        onDoubleClick={s.onCanvasDoubleClick}
      >
        <div className="graph-dots" aria-hidden="true" />
        <div className="graph-host" style={{ left: ins.l, right: ins.r, bottom: ins.b }}>
          {s.phase === "loading" && <div className="loading">fetching the byte-gated graph from the hub…</div>}
          {s.phase === "failed" && (
            <div className="pane-status graph-note">
              graph wall refused/unreachable — see the banner region (named class, never blank)
            </div>
          )}
          {s.phase === "ready" && s.wall !== null && <GraphView key={s.graphViewKey} cell={s.wall.cell} />}
        </div>

        {counts !== null && (
          <div className="canvas-overlay stats-pill" style={{ left: ins.l + 14 }}
            title="counts from the byte-gated served /graph envelope id sets">
            {counts.nodes} nodes · {counts.edges} edges · {counts.leads} leads — drag window titles ·
            drop on an edge zone to dock · gear menu for view modes
          </div>
        )}

        <div className="canvas-overlay zoom-cluster" style={{ right: ins.r + 14 }}>
          <button type="button" disabled
            title="zoom is owned by the graph cell's own canvas (scroll/pinch inside it) — the wall exposes no external zoom API this round">−</button>
          <span className="zoom-pct" title="the cell's canvas owns the viewport; its moves are probed (render.viewport) on the wall's own pins">canvas</span>
          <button type="button" disabled
            title="zoom is owned by the graph cell's own canvas (scroll/pinch inside it) — the wall exposes no external zoom API this round">+</button>
          <button type="button" disabled={s.wall === null}
            title={s.wall === null ? "graph wall not mounted" : "zoom to fit (React Flow fitView, inset by the open docked edges)"}
            onClick={s.zoomToFit}>⤢</button>
        </div>

        <div className="canvas-overlay legend-cluster" style={{ left: ins.l + 14, bottom: ins.b + 14 }}>
          {s.legendOpen && (
            <div className="legend-panel">
              <VerdictLegend analysisApplied={s.analysisState?.kind === "applied"} />
            </div>
          )}
          <button type="button" className="legend-chip" data-testid="legend-chip"
            onClick={() => s.setLegendOpen((v) => !v)}>
            <span className="legend-tw">{s.legendOpen ? "▾" : "▸"}</span> verdict legend (canonical: packages/schema/gen)
          </button>
        </div>

        {inspNode !== null && (
          <div className="canvas-overlay inspector" data-testid="inspector"
            style={{ right: ins.r + 14, bottom: ins.b + 14 }}>
            <div className="inspector-head">
              <b>{inspNode.name}</b>
              <span className="mono inspector-id">{inspNode.id}</span>
              <button type="button" aria-label="clear selection"
                onClick={() => s.setSelectedNodeId(null)}>✕</button>
            </div>
            {inspPaint !== null ? (
              <div className="inspector-facts">
                <span className="inspector-chip mono">
                  <span className="inspector-dot" style={{ background: inspPaint.fillHatched ? HATCH_CSS : inspPaint.fillColor }} />
                  fill {inspPaint.fillStatus}{inspPaint.fillStatus === "unknown" ? " (≠ green)" : ""}
                </span>
                <span className="inspector-chip mono">
                  <span className="inspector-ring" style={{
                    borderColor: inspPaint.outlineColor,
                    borderStyle: inspPaint.outlineWasNull ? "dashed" : "solid",
                  }} />
                  {inspPaint.outlineWasNull ? "ring: null → not-yet-computed" : `ring ${inspPaint.outlineStatus}`}
                </span>
              </div>
            ) : (
              <div className="hint">paints not served for this node (wall pins have no entry — nothing is claimed)</div>
            )}
            <div className="inspector-actions">
              <button type="button" title="opens the Editor tool window at this declaration (selection rides the V5 bus)"
                onClick={() => {
                  probeShell("shell.inspector.reveal", { nodeId: inspNode.id });
                  s.openWindow("editor", `inspector reveal ${inspNode.id}`);
                  s.bus.graphSide.emit({ type: "select", nodeId: inspNode.id, source: "graph" });
                }}>↗ reveal in editor</button>
              <span className="mono hint">
                {inspNode.span !== undefined ? `${inspNode.span.file} · bytes ${inspNode.span.byteStart}–${inspNode.span.byteEnd}` : "(no span served)"}
              </span>
            </div>
          </div>
        )}

        <WindowLayer
          layout={layout}
          setLayoutLive={s.setLayout}
          commitLayout={s.commitLayout}
          mw={s.canvasSize.w}
          mh={s.canvasSize.h}
          meta={windowMeta}
          content={windowContent}
          transientCloseTick={s.transientCloseTick}
        />
      </div>
    </div>
  );
}
