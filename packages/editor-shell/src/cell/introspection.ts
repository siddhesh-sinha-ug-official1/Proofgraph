/**
 * Introspection entry points (all return real data) — SUB200 restructure:
 * split from the EditorShellCell methods, logic and probes verbatim.
 */

import type { ProbeEvent } from "../probe/probe-bus.js";
import type { ProbeSpec } from "../probe/catalog.js";
import type { EditorShellCell } from "./cell.js";

export function probeCatalogCore(cell: EditorShellCell): ProbeSpec[] {
  const catalog = cell.probe.probeCatalog();
  cell.probe.emit(
    "editor.probe.catalog",
    {
      probes: catalog.map(({ probeId, kind, payloadType, description }) => ({
        probeId,
        kind,
        payloadType,
        description,
      })),
    },
    null,
  );
  return catalog;
}

export function dumpCore(cell: EditorShellCell): unknown {
  const snapshot = {
    modelState: cell.buffer.state(),
    spanIndex: cell.index_?.snapshot() ?? null,
    connState: cell.connector?.snapshot() ?? null,
    pump: cell.pump.snapshot(),
    lastDiagnostics: cell.diagnostics.snapshot(),
    decorations: cell.render.decorations(),
    verdicts: cell.verdict?.snapshot() ?? null,
    busLog: (cell.bus as { log?: unknown }).log ?? null,
    mountInfo: cell.adapter.mountInfo(),
    silentMutations: cell.buffer.silentMutationCount(),
  };
  cell.probe.emit("editor.probe.dump", snapshot, null);
  return snapshot;
}

export function historyCore(cell: EditorShellCell): ProbeEvent[] {
  const events = cell.probe.history();
  cell.probe.emit("editor.probe.history", { eventCount: events.length, events }, null);
  return events;
}
