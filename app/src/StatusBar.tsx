/**
 * App-shell round — the status bar. EVERY fact here is sourced, never
 * hardcoded (contract "Status bar facts read from PINS"):
 *   schema pin        ← GET /health.schemaPin (hub-served);
 *   measured tier +
 *   transport         ← the editor pane's status, which reads the tier
 *                       VERBATIM from the hub-aggregated
 *                       capability.wall.construct pin (or declares the stub
 *                       floor honestly);
 *   N/E/L counts      ← the byte-gated served /graph envelope's id sets;
 *   analysis state    ← /analysis (applied / pending(class) / failed(class));
 *   selected nodeId   ← the V5 joined bus (last select event, either origin).
 */

import React from "react";
import type { EditorPaneStatus } from "./EditorPane";

export interface StatusBarProps {
  /** UI-1C nav-bar breadcrumbs (left): workspace › file › decl — every segment
   *  from REAL data (served /workspace root, the active tab, the selected
   *  node's served name); empty array = no crumb row rendered. */
  breadcrumbs: string[];
  schemaPin: { schemaVersion: string; schemaHash: string } | null;
  editorStatus: EditorPaneStatus | null;
  editorDisabled: boolean;
  counts: { nodes: number; edges: number; leads: number } | null;
  analysis:
    | { kind: "applied"; applied: number; unverdicted: number }
    | { kind: "pending"; failureClass: string; detail: string }
    | { kind: "failed"; failureClass: string; detail: string }
    | null;
  selectedNodeId: string | null;
  dirtyCount: number;
}

export default function StatusBar(p: StatusBarProps): React.ReactElement {
  return (
    <div className="status-bar" role="status" data-testid="status-bar">
      {p.breadcrumbs.length > 0 && (
        <span className="status-crumbs" data-testid="breadcrumbs" title="workspace › file › decl — from served data only">
          {p.breadcrumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="crumb-sep">›</span>}
              <span className="crumb">{c}</span>
            </React.Fragment>
          ))}
        </span>
      )}
      <span className="status-seg" title="hub-served schema pin (GET /health) — never hardcoded">
        pin:{" "}
        {p.schemaPin !== null
          ? <b>{p.schemaPin.schemaVersion}/{p.schemaPin.schemaHash.slice(0, 8)}…</b>
          : <span className="hint">unserved</span>}
      </span>
      <span className="status-seg" title="measured tier — read verbatim from the capability.wall.construct pin via the hub; the stub floor declares itself">
        tier: <b>{p.editorDisabled ? "—" : p.editorStatus?.tier ?? "?"}</b>
        {" · "}transport: <b>{p.editorDisabled ? "editor disabled (test/headless mode)" : p.editorStatus?.transport ?? "probing"}</b>
      </span>
      <span className="status-seg" title="counts from the byte-gated served /graph envelope id sets">
        {p.counts !== null
          ? <>{p.counts.nodes} nodes · {p.counts.edges} edges · {p.counts.leads} leads</>
          : <span className="hint">no graph served yet</span>}
      </span>
      <span className="status-seg" title="GET /analysis state — pending is honest, never green">
        analysis:{" "}
        <b>
          {p.analysis === null && "…"}
          {p.analysis?.kind === "applied" && `applied (${p.analysis.applied} verdicts)`}
          {p.analysis?.kind === "pending" && `pending (${p.analysis.failureClass})`}
          {p.analysis?.kind === "failed" && `failed (${p.analysis.failureClass})`}
        </b>
      </span>
      {p.dirtyCount > 0 && (
        <span className="status-seg status-dirty" title="tabs with unsaved changes">● {p.dirtyCount} unsaved</span>
      )}
      <span className="status-seg status-selected" title="selected node id from the V5 joined bus (byte-identical at every hop)">
        {p.selectedNodeId !== null ? <>sel: <code>{p.selectedNodeId}</code></> : <span className="hint">no selection</span>}
      </span>
    </div>
  );
}
