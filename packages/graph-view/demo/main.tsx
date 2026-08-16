/**
 * Demo harness (dev-only, outside the cell's import boundary): runs the full
 * S0–S7 pipeline on the walking-skeleton fixture with the REAL ELK Web Worker,
 * a mock Tree 4 bus, and a live probe-firehose panel. Buttons simulate the
 * editor side of the vasculature.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
// Vite-bundled ELK worker — the real off-main-thread path (layout.worker.* leads).
// eslint-disable-next-line import/no-unresolved
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";

import { runGraphView, type GraphViewCell } from "../src/cell";
import { createMockGraphEventBus } from "../src/eventBus";
import { GraphView } from "../src/GraphView";
import type { ProbeEvent } from "../src/probeBus";
import skeleton from "../fixtures/skeleton.schema.json";

type MockBus = ReturnType<typeof createMockGraphEventBus>;

function ProbePanel({ cell }: { cell: GraphViewCell }) {
  const [events, setEvents] = useState<ProbeEvent[]>(cell.history());
  useEffect(() => {
    const timer = setInterval(() => setEvents(cell.history()), 500);
    return () => clearInterval(timer);
  }, [cell]);
  const catalogSize = cell.probeCatalog().length;
  return (
    <div style={{ borderLeft: "1px solid #ddd", overflow: "auto", fontSize: 11, padding: 8 }}>
      <strong>
        probe firehose — {events.length} events · {catalogSize} cataloged leads
      </strong>
      <div style={{ margin: "4px 0", color: "#555" }}>
        engine: {cell.engine.name}@{cell.engine.version} ({cell.engine.spdx}) · worker: {String(cell.engine.worker)}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {events.slice(-400).map((e) => (
            <tr key={e.logicalClock} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ color: "#999", paddingRight: 4 }}>{e.logicalClock}</td>
              <td style={{ color: "#1565C0", paddingRight: 4 }}>{e.stage}</td>
              <td style={{ paddingRight: 4 }}>{e.probeId}</td>
              <td style={{ color: "#555", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {JSON.stringify(e.payload)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const mockBus = useMemo<MockBus>(() => createMockGraphEventBus(), []);
  const [cell, setCell] = useState<GraphViewCell | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runGraphView(skeleton, mockBus, {
      workerFactory: () => new ElkWorker(),
      linkHooks: { onExpandChange: (ids) => setExpandedIds(new Set(ids)) },
      sourceLabel: "fixtures/skeleton.schema.json",
    })
      .then(setCell)
      .catch((e) => setError(String(e)));
  }, [mockBus]);

  if (error) return <pre style={{ color: "#C62828", padding: 16 }}>{error}</pre>;
  if (!cell) return <div style={{ padding: 16 }}>running S0–S7…</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", height: "100%" }}>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", bottom: 8, left: 8, zIndex: 20, display: "flex", gap: 6 }}>
          <button onClick={() => mockBus.deliverSelect("B")}>editor selects B</button>
          <button onClick={() => mockBus.deliverSelect("ZZZ")}>editor selects ZZZ (absent)</button>
          <button onClick={() => cell.controller.requestExpand(cell.controller.selectedId ?? "A")}>
            expand selected → Monaco slot
          </button>
          <button onClick={() => mockBus.deliverHover("C")}>editor hovers C</button>
        </div>
        <GraphView cell={cell} expandedIds={expandedIds} />
      </div>
      <ProbePanel cell={cell} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
