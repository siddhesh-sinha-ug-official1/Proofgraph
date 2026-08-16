/**
 * The resolved=false renderer. A lead is NOT an edge: dashed, faded, grey —
 * visually UNLIKE any solid real relationship, and labeled unresolved.
 */

import React from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function LeadEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{ strokeDasharray: "4 4", stroke: "#9E9E9E", opacity: 0.6 }}
      />
      <text
        x={labelX}
        y={labelY}
        style={{ fontSize: 9, fill: "#9E9E9E" }}
        textAnchor="middle"
        className="lead-edge-label"
      >
        unresolved
      </text>
    </>
  );
}
