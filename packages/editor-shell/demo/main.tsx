/**
 * Tree 4 demo — the walking skeleton against REAL Monaco.
 *
 * Layout per §7.3: the editor is one pane, the "graph pane" (a stand-in for
 * Tree 5, since this is a clean-room build) is a SIBLING pane; they talk ONLY
 * through the shared SelectionBus. Below both: a live probe console tapping
 * the cell's firehoses — the probe-everything rule made visible.
 *
 * SUB200 restructure: the cell wiring + display helpers live in
 * ./demo-cell.ts; this module is the React shell, behavior unchanged.
 */

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";

// Monaco worker wiring (editor worker only — the LSP is our own pump).
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

import type { EditorShellCell } from "../src/cell.js";
import type { ProbeEvent } from "../src/probe/probe-bus.js";
import { LocalSelectionBus } from "../src/seams/bus.js";
import {
  createDemoCell,
  exposeForSpike,
  meta,
  nodes,
  outlineDisplay,
  shortPayload,
  type ChipState,
} from "./demo-cell.js";

function App(): React.ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);
  const cellRef = useRef<EditorShellCell | null>(null);
  const busRef = useRef(new LocalSelectionBus());
  const [chips, setChips] = useState<ChipState[]>([]);
  const [events, setEvents] = useState<ProbeEvent[]>([]);
  const [counts, setCounts] = useState({ total: 0, silent: 0, leads: 0 });

  useEffect(() => {
    let disposed = false;
    (async () => {
      // Font first, so editor.mount.font.applied reports the truth we want.
      await (document as Document & { fonts: FontFaceSet }).fonts.ready;
      if (disposed || !editorRef.current) return;

      const cell = createDemoCell(editorRef.current, busRef.current);
      cellRef.current = cell;

      const buffer: ProbeEvent[] = [];
      cell.tap("*", (e) => {
        buffer.push(e);
        if (buffer.length > 400) buffer.splice(0, buffer.length - 400);
      });

      await cell.open();
      exposeForSpike(cell);
      refreshChips();

      // Live UI refresh loop (UI-only; the probe stream itself is untouched).
      const timer = setInterval(() => {
        setEvents([...buffer.slice(-120)]);
        setCounts({
          total: cell.probe.currentClock(),
          silent: cell.buffer.silentMutationCount(),
          leads: cell.probe.firedProbeIds().length,
        });
        refreshChips();
      }, 300);

      function refreshChips(): void {
        const decisions = new Map(cell.verdict!.decisions().map((d) => [d.nodeId, d]));
        const lastSelected = busRef.current.log.at(-1)?.nodeId;
        setChips(
          nodes
            .filter((n) => n.span.file === meta.uri)
            .map((n) => ({
              node: n,
              fill: decisions.get(n.id)?.displayedStatus ?? n.fill.status,
              // Probe-free mirror of S5's worst-case-wins, for UI chips only —
              // calling decideOutline here would pollute the probe stream.
              outline: outlineDisplay(n),
              selected: n.id === lastSelected,
            })),
        );
      }

      return () => clearInterval(timer);
    })();
    return () => {
      disposed = true;
      void cellRef.current?.dispose("demo unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <div className="panes">
        <div className="editor-pane" ref={editorRef} />
        <div className="graph-pane">
          <h2>graph pane (Tree 5 stand-in)</h2>
          <div className="hint">
            Click a node → BusEvent origin:"graph" → editor reveals + highlights.
            Move the caret in the editor → chip lights up via origin:"editor".
          </div>
          {chips.map((c) => (
            <div
              key={c.node.id}
              className={`node-chip ${c.selected ? "selected" : ""}`}
              title={`${c.node.id}\nfill: ${c.fill} (${c.node.fill.source || "no source"})\noutline: ${c.outline}`}
              onClick={() =>
                busRef.current.emit({
                  type: "node.select",
                  nodeId: c.node.id, // the exact Tree 1 id, carried untouched
                  origin: "graph",
                  clock: Date.now(),
                })
              }
            >
              <span className={`fill-dot fill-${c.fill} ring-${c.outline}`} />
              <span className="name">{c.node.name}</span>
              <span className="kind">{c.node.kind}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="probe-console">
        <div className="probe-toolbar">
          <span className="stat">clock <b>{counts.total}</b></span>
          <span className="stat">distinct leads fired <b>{counts.leads}</b></span>
          <span className="stat">silent mutations <b style={{ color: counts.silent ? "#e05555" : "#4caf50" }}>{counts.silent}</b></span>
          <button onClick={() => console.log(cellRef.current?.dump())}>dump() → console</button>
          <button onClick={() => console.log(cellRef.current?.probeCatalog())}>catalog() → console</button>
          <button onClick={() => console.log(cellRef.current?.history())}>history() → console</button>
        </div>
        <div className="probe-log">
          {events.map((e) => (
            <div className="ev" key={e.logicalClock}>
              <span className="clock">{String(e.logicalClock).padStart(5, "0")}</span>{" "}
              <span className={`stage-${e.stage}`}>{e.probeId}</span>{" "}
              <span className="clock">{shortPayload(e.payload)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
