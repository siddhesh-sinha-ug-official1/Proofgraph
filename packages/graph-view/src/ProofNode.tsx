/**
 * The node IS a React component (the single reason React Flow is the pick):
 * FILL body from the node's OWN compiler verdict, OUTLINE ring from the transitive
 * trust base (worst-case-wins), provenance never anonymous, and — in expanded
 * mode — an EMPTY [data-slot="monaco"] div a real Monaco mini-view mounts into
 * in a later round with zero structural change.
 */

import React, { memo, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import type { RFNodeData } from "./apply";
import { HATCH_CSS } from "./verdict";
import { useProbeBus } from "./probeContext";

export interface ProofNodeProps {
  id: string;
  data: RFNodeData;
  selected?: boolean;
}

function ProofNodeInner({ id, data, selected }: ProofNodeProps) {
  const bus = useProbeBus();
  const { paint, node, mode, placeholder } = data;

  // The empty Monaco slot mounting is itself a probed state transition.
  useEffect(() => {
    if (mode === "expanded" && bus) {
      bus.emit({
        probeId: "link.expand.slot", stage: "S7", kind: "state",
        payload: { nodeId: id, slotMounted: true, slotSelector: '[data-slot="monaco"]' },
      });
    }
  }, [mode, id, bus]);

  return (
    <div
      className={`proof-node ${paint.fillHatched ? "hatched" : ""} ${placeholder ? "placeholder" : ""}`}
      data-node-id={id}
      data-fill-status={paint.fillStatus}
      data-outline-status={paint.outlineStatus}
      data-mode={mode}
      style={{
        background: paint.fillHatched ? HATCH_CSS : paint.fillColor, // unknown ⇒ hatch, NEVER green
        boxShadow: `0 0 0 3px ${paint.outlineColor}`,                 // OUTLINE ring, worst-case-wins
        outline: selected ? "2px solid #000" : "none",
        borderRadius: 8,
        padding: 8,
        minWidth: placeholder ? 140 : 200,
        color: paint.fillHatched ? "#212121" : "#fff",
        fontSize: 12,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle type="target" position={Position.Top} />
      {placeholder || !node ? (
        <header>unresolved target: {id}</header>
      ) : (
        <>
          <header style={{ fontWeight: 600 }}>
            {node.kind}: {node.name}
          </header>
          <small className="prov" data-testid="provenance">
            tier {node.provenance.tier} · {node.origin} · {node.provenance.resolved ? "resolved" : "unresolved"} · fill:{node.fill.source || "none"}
          </small>
          {mode === "expanded" ? (
            <div
              className="monaco-slot"
              data-slot="monaco"
              style={{ width: 440, height: 220, background: "rgba(0,0,0,0.25)", borderRadius: 4, marginTop: 6 }}
            />
          ) : (
            <code className="sig" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.signature ?? ""}
            </code>
          )}
        </>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/**
 * React.memo with a probing comparator: React calls this on every re-render
 * attempt, so each call IS the memo hit/miss lead. A storm of misses is the
 * DOM-ceiling perf smell. (First mounts don't invoke the comparator — that's a
 * render, not a memo decision.)
 *
 * The probe sink travels IN the node data (`data.memoProbe`, bound per GraphView
 * instance to that instance's bus) — never a module global: two mounted canvases
 * must not cross-wire each other's render.memo events, and one unmounting must
 * not silently darken the survivor's lead.
 */
function areEqual(prev: ProofNodeProps, next: ProofNodeProps): boolean {
  const equal =
    prev.id === next.id &&
    prev.data.paint === next.data.paint &&
    prev.data.mode === next.data.mode &&
    prev.data.node === next.data.node &&
    prev.selected === next.selected;
  next.data.memoProbe?.(next.id, equal);
  return equal;
}

export const ProofNode = memo(ProofNodeInner, areEqual);
