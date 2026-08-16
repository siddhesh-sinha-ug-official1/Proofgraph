/**
 * The verdict legend (SUB200 split of App.tsx — no behavior change):
 * canonical vocabulary ONLY (packages/schema/gen): fills, outline rings
 * (7-token worstOf order), and the honest ceiling. App.tsx is the facade.
 */

import React from "react";
import { COLORS, HATCH_CSS } from "@graph-view/src/verdict";
import { OUTLINE_WORST_ORDER, WORST_TO_STATUS } from "@schema/gen/graph-schema";

export function VerdictLegend({ analysisApplied }: { analysisApplied: boolean }): React.ReactElement {
  const fills: Array<[string, string]> = [
    ["green", "verdict from a real check"],
    ["amber", "warnings"],
    ["red", "failing"],
    ["blue", "definition/axiom-like"],
    ["unknown", "NOT green — hatched grey (honest ceiling)"],
  ];
  return (
    <div className="legend-body">
      <div className="legend-row">
        {fills.map(([status, note]) => (
          <span key={status} className="legend-item" title={note}>
            <span
              className="legend-dot"
              style={status === "unknown"
                ? { background: HATCH_CSS }
                : { background: COLORS[status as keyof typeof COLORS] }}
            />
            fill {status}
          </span>
        ))}
      </div>
      <div className="legend-row">
        <span className="legend-item">
          <span className="legend-ring" style={{ borderColor: COLORS.unknown, borderStyle: "dashed" }} />
          outline null = not-yet-computed (grey — {analysisApplied ? "only for unverdicted nodes now" : "/analysis pending"})
        </span>
        <span className="legend-item">
          <span className="legend-lead" />
          lead (resolved=false) — dashed, never an edge, never followed
        </span>
      </div>
      <div className="hint">
        outline worst-case-wins order (earlier = worse): {OUTLINE_WORST_ORDER.join(" > ")} ·
        token→status: {OUTLINE_WORST_ORDER.map((t) => `${t}→${WORST_TO_STATUS[t]}`).join(", ")} ·
        unknown never upgrades; an unrecognized token ranks WORST and renders unknown.
      </div>
    </div>
  );
}
