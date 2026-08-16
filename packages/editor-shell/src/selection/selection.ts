/**
 * S6 — Selection / brushing-and-linking. The seam with Tree 5.
 *
 * Emit: caret → innermost containing Node.id (via S7) → BusEvent on the shared
 * bus. The id is carried BYTE-IDENTICAL from the schema — never re-derived.
 * Receive: bus id → reveal + highlight that span; foreign ids are ignored on
 * purpose (logged). An echo guard prevents a received id from re-emitting.
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { BusEvent, SelectionBus } from "../seams/bus.js";
import type { CursorEvent, EditorAdapter } from "../mount/adapter.js";
import type { SpanIndex } from "../map/span-index.js";
import type { RenderTracker } from "../render/render.js";

export class SelectionBridge {
  private probe: ProbeBus;
  private bus: SelectionBus;
  private adapter: EditorAdapter;
  private render: RenderTracker;
  private index: () => SpanIndex;
  private inRecv = false;
  private unsubs: Array<() => void> = [];

  constructor(opts: {
    probe: ProbeBus;
    bus: SelectionBus;
    adapter: EditorAdapter;
    render: RenderTracker;
    /** Live accessor — S7 rebuilds the index on edit; never hold a stale one. */
    index: () => SpanIndex;
  }) {
    this.probe = opts.probe;
    this.bus = opts.bus;
    this.adapter = opts.adapter;
    this.render = opts.render;
    this.index = opts.index;
    this.unsubs.push(this.adapter.onDidChangeCursor((e) => this.handleCursor(e)));
    this.unsubs.push(this.bus.subscribe((e) => this.handleBusEvent(e)));
  }

  private handleCursor(e: CursorEvent): void {
    const cursorProbe = this.probe.emit(
      "editor.select.emit.cursor",
      { position: e.position, selection: e.selections[0] ?? null },
      null,
    );
    const cursorRef = this.probe.ref(cursorProbe);

    // No debounce configured in the skeleton — the decision records that this
    // is a policy, not an accident (a rate cap would be logged here).
    this.probe.emit(
      "editor.select.emit.debounce",
      { rawEvents: 1, emitted: 1, windowMs: 0, reason: "no-debounce-configured" },
      cursorRef,
    );

    const idx = this.index();

    if (e.selections.length > 1) {
      const ids = e.selections
        .map((s) => idx.nodeAtPosition(s.start, cursorRef)?.node.id ?? null)
        .filter((x): x is string => x !== null);
      this.probe.emit(
        "editor.select.emit.multi",
        {
          selectionCount: e.selections.length,
          nodeIds: ids,
          policy: "primary-caret",
          reason: "multi-cursor emits the primary caret's node only (policy, logged — not a silent first-wins)",
        },
        cursorRef,
      );
    }

    const hit = idx.nodeAtPosition(e.position, cursorRef);
    if (!hit) {
      this.probe.emit(
        "editor.select.emit.miss",
        { position: e.position, reason: "noNodeAtCaret" },
        cursorRef,
      );
      return;
    }
    const resolveProbe = this.probe.emit(
      "editor.select.emit.resolve",
      { position: e.position, nodeId: hit.node.id, span: { ...hit.span }, matchKind: "innermost" },
      cursorRef,
    );
    const resolveRef = this.probe.ref(resolveProbe);

    if (this.inRecv) {
      // Echo guard case: this cursor movement was caused by applying a
      // received selection — re-emitting would loop editor↔graph forever.
      this.probe.emit(
        "editor.select.echo.guard",
        { nodeId: hit.node.id, suppressedReEmit: true, reason: "cursor change during recv handling" },
        resolveRef,
      );
      return;
    }

    const busEvent: BusEvent = {
      type: "node.select",
      nodeId: hit.node.id, // carried through untouched — Tree 1's exact string
      origin: "editor",
      clock: resolveProbe.logicalClock,
    };
    const emitProbe = this.probe.emit("editor.select.emit.bus", { busEvent }, resolveRef);
    this.probe.emit(
      "editor.select.timing",
      {
        emitToBusClockDelta: emitProbe.logicalClock - cursorProbe.logicalClock,
        busToHighlightClockDelta: null,
      },
      this.probe.ref(emitProbe),
    );
    this.bus.emit(busEvent);
  }

  private handleBusEvent(e: BusEvent): void {
    if (e.origin === "editor") {
      // Our own event reflected back off the bus — the other echo-guard case.
      this.probe.emit(
        "editor.select.echo.guard",
        { nodeId: e.nodeId, suppressedReEmit: true, reason: "own editor-origin event reflected back" },
        null,
      );
      return;
    }
    const recvProbe = this.probe.emit(
      "editor.select.recv.bus",
      { nodeId: e.nodeId, origin: e.origin },
      null,
    );
    const recvRef = this.probe.ref(recvProbe);

    const idx = this.index();
    const hit = idx.getById(e.nodeId);
    this.probe.emit(
      "editor.select.recv.lookup",
      { nodeId: e.nodeId, span: hit ? { ...hit.span } : null, found: !!hit },
      recvRef,
    );
    if (!hit) {
      this.probe.emit(
        "editor.select.recv.miss",
        { nodeId: e.nodeId, reason: "idNotInThisFile" },
        recvRef,
      );
      return;
    }

    this.inRecv = true;
    try {
      const range = idx.spanToRange(hit.span, recvRef);
      this.adapter.revealRangeInCenter(range);
      this.render.paint(
        "highlight",
        [{ key: e.nodeId, range, style: "pg-brush-highlight" }],
        "decoration",
        recvRef,
      );
      const revealProbe = this.probe.emit(
        "editor.select.recv.reveal",
        { nodeId: e.nodeId, monacoRange: range, revealed: "center", highlightApplied: true },
        recvRef,
      );
      this.probe.emit(
        "editor.select.timing",
        {
          emitToBusClockDelta: null,
          busToHighlightClockDelta: revealProbe.logicalClock - recvProbe.logicalClock,
        },
        this.probe.ref(revealProbe),
      );
      this.probe.emit(
        "editor.select.echo.guard",
        { nodeId: e.nodeId, suppressedReEmit: false, reason: "recv completed; no re-emit was attempted" },
        this.probe.ref(revealProbe),
      );
    } finally {
      this.inRecv = false;
    }
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }
}
