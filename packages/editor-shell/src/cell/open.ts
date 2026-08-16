/**
 * The walking-skeleton open sequence + the wall's node-refresh path (SUB200
 * restructure: split from EditorShellCell.open / updateSchemaNodes, logic and
 * probes verbatim).
 */

import type { ProbeEvent } from "../probe/probe-bus.js";
import type { SchemaNode } from "../schema/schema.js";
import { Connector } from "../conn/connector.js";
import { VerdictEngine } from "../verdict/verdict.js";
import { SelectionBridge } from "../selection/selection.js";
import { SpanIndex } from "../map/span-index.js";
import type { EditorShellCell } from "./cell.js";

/** didOpen with the cell's exact identity fields (split from the cell class). */
function sendDidOpen(cell: EditorShellCell, causeRef: string | null): void {
  cell.pump.notify(
    "textDocument/didOpen",
    {
      textDocument: {
        uri: cell.cfg.file.uri,
        languageId: cell.cfg.file.languageId,
        version: cell.adapter.getVersionId(),
        text: cell.adapter.getText(),
      },
    },
    causeRef,
  );
}

/** Rebuild the live span index (split from the cell class, logic verbatim). */
function rebuildIndex(cell: EditorShellCell, causeRef: string | null): void {
  cell.index_ = new SpanIndex({
    probe: cell.probe,
    fileUri: cell.cfg.file.uri,
    modelText: cell.adapter.getText(),
    bomBytes: cell.buffer.bomBytes(),
    // The index measures bytes in the FILE'S encoding — a latin1/utf-16
    // source must not be measured with utf-8 math (review finding).
    encoding: cell.buffer.encoding(),
    nodes: cell.cfg.schemaNodes,
    builtAtVersion: cell.adapter.getVersionId(),
    causeId: causeRef,
  });
}

/**
 * Walking-skeleton open: mount → buffer → span index → connect one server →
 * didOpen → initial verdict paint. Every step probed and causally chained.
 */
export async function openCell(cell: EditorShellCell): Promise<void> {
  try {
    cell.mountCtl.begin(cell.mountConfig, cell.adapter);

    const openProbe = cell.buffer.open({
      uri: cell.cfg.file.uri,
      bytes: cell.cfg.file.bytes,
      languageId: cell.cfg.file.languageId,
      readOnly: cell.mountConfig.readOnly,
    });
    const openRef = cell.probe.ref(openProbe);

    rebuildIndex(cell, openRef);
    cell.mountCtl.ready(cell.adapter, cell.cfg.file.uri, cell.mountConfig);

    // ── S2: ONE server through the capability handle. Tree 2 owns the tier.
    cell.cap = cell.cfg.capability(cell.cfg.file.lang);
    cell.connector = new Connector(
      cell.probe,
      cell.pump,
      cell.cap,
      cell.cfg.file.lang,
      cell.cfg.connector,
    );
    cell.verdict = new VerdictEngine(
      cell.probe,
      cell.render,
      cell.cap.tier,
      "(not yet connected)",
    );

    cell.pump.onDiagnostics((params, causeRef) => cell.handleDiagnostics(params, causeRef));

    await cell.connector.connect(openRef);
    cell.verdict.setServerName(cell.connector.state.serverInfo?.name ?? "(unnamed server)");
    cell.connector.onReopen(() => {
      // After a reconnect the server has no document state: re-didOpen.
      sendDidOpen(cell, null);
    });

    sendDidOpen(cell, openRef);

    // ── buffer changes: index rebuild FIRST, then didChange, then repaint.
    // Order matters: the in-memory (and any fast) transport delivers the
    // server's publishDiagnostics synchronously INSIDE pump.notify, so the
    // index must already be fresh and the latency chain already armed when
    // that batch is span-mapped (failure classes: stale coordinate,
    // invisible first-keystroke latency — both found by the §9 agents).
    cell.buffer.onChange((n) => {
      const changeRef = cell.probe.ref(n.changeProbe);
      cell.render.noteEdit();
      // The old index is now stale — never resolve against it.
      cell.probe.emit(
        "editor.map.stale",
        {
          builtAtVersion: cell.index_?.builtAtVersion ?? -1,
          currentVersion: cell.adapter.getVersionId(),
          action: "rebuild",
        },
        changeRef,
      );
      rebuildIndex(cell, changeRef);
      if (n.classification === "user") {
        // didChangeClock is resolved at diagnostics time from the emitted
        // didChange probe (notify emits its probes before sending the frame).
        cell.pendingLatency = { keystrokeClock: n.changeProbe.logicalClock };
      }
      cell.pump.notify(
        "textDocument/didChange",
        {
          textDocument: { uri: cell.cfg.file.uri, version: cell.adapter.getVersionId() },
          contentChanges: [{ text: cell.adapter.getText() }],
        },
        changeRef,
      );
      cell.repaintVerdicts(changeRef);
    });

    // ── S6: brushing-and-linking over the shared bus.
    cell.selection = new SelectionBridge({
      probe: cell.probe,
      bus: cell.bus,
      adapter: cell.adapter,
      render: cell.render,
      index: () => cell.index(),
    });

    // Initial paint + viewport truth.
    cell.repaintVerdicts(openRef);
    cell.render.emitViewport(
      cell
        .index()
        .allNodes()
        .map((n) => n.node.id),
      openRef,
    );
  } catch (err) {
    cell.mountCtl.error("open", err);
    throw err;
  }
}

/**
 * ASSEMBLY Phase 1 (wall) — the node-refresh path. Before the wall, the cell
 * had no way to receive fresh schema nodes/verdicts short of dispose +
 * re-open; the wall's update(nodes) needs a REAL path, never a silent
 * re-mount. This one is additive and reuses the exact machinery every buffer
 * edit already runs: rebuildIndex → repaintVerdicts → emitViewport, all
 * causally chained to a cataloged probe (editor.map.nodes.refresh).
 * Called before open(), it just replaces the node set open() will index.
 */
export function updateSchemaNodesCore(
  cell: EditorShellCell,
  nodes: SchemaNode[],
  causeId: string | null,
): ProbeEvent {
  cell.cfg.schemaNodes = nodes;
  const refreshProbe = cell.probe.emit(
    "editor.map.nodes.refresh",
    {
      nodeCount: nodes.length,
      mounted: cell.index_ !== null && cell.verdict !== null,
      reason: "schema-nodes-updated",
    },
    causeId,
  );
  if (!cell.index_ || !cell.verdict) return refreshProbe; // not open yet: open() indexes the new set
  const ref = cell.probe.ref(refreshProbe);
  rebuildIndex(cell, ref);
  cell.repaintVerdicts(ref);
  cell.render.emitViewport(
    cell
      .index()
      .allNodes()
      .map((n) => n.node.id),
    ref,
  );
  return refreshProbe;
}
