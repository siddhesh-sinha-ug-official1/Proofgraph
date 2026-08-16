/**
 * S8 — Render / paint tracking.
 *
 * The core computes decoration deltas and hands full sets to the adapter; every
 * paint cycle is probed (reason stream = what causes repaints), decoration
 * z-order collisions are resolved as a logged decision, and the
 * keystroke→diagnostic latency chain is assembled here from logical clocks.
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import type { Decoration, DecorationKind, EditorAdapter } from "../mount/adapter.js";

export type FrameReason = "decoration" | "cursor" | "diagnostic" | "scroll";

/** Fixed stacking: markers over highlights over gutter glyphs. */
const Z_ORDER: DecorationKind[] = ["marker", "highlight", "gutter", "outline"];

export interface LatencyChain {
  keystrokeClock: number;
  didChangeClock: number;
  diagInClock: number;
}

export class RenderTracker {
  private probe: ProbeBus;
  private adapter: EditorAdapter;
  private current = new Map<DecorationKind, Decoration[]>();
  private paintsSinceOpen = 0;
  private paintsSinceLastEdit = 0;

  constructor(probe: ProbeBus, adapter: EditorAdapter) {
    this.probe = probe;
    this.adapter = adapter;
  }

  noteEdit(): void {
    this.paintsSinceLastEdit = 0;
  }

  /**
   * Replace the decoration set of one kind; emits delta, frame, paint-count and
   * (when kinds collide on a line) z-order probes. Returns the frame event.
   */
  paint(
    kind: DecorationKind,
    decs: Decoration[],
    reason: FrameReason,
    causeId: string | null = null,
  ): ProbeEvent {
    const prev = this.current.get(kind) ?? [];
    const prevKeys = new Set(prev.map((d) => d.key));
    const nextKeys = new Set(decs.map((d) => d.key));
    let added = 0;
    let removed = 0;
    let kept = 0;
    for (const k of nextKeys) (prevKeys.has(k) ? kept++ : added++);
    for (const k of prevKeys) if (!nextKeys.has(k)) removed++;

    const deltaProbe = this.probe.emit(
      "editor.render.decoration.delta",
      { added, removed, kept, kind },
      causeId,
    );
    const deltaRef = this.probe.ref(deltaProbe);

    this.current.set(kind, decs.map((d) => ({ ...d })));
    this.adapter.applyDecorations(kind, decs);

    // Z-order: if another kind occupies any of the same start lines, record
    // which renders on top and why — a visible-but-wrong stacking is otherwise
    // a silent UX bug.
    const myLines = new Map<number, string>();
    for (const d of decs) myLines.set(d.range.startLine, d.key);
    for (const [otherKind, otherDecs] of this.current) {
      if (otherKind === kind) continue;
      for (const od of otherDecs) {
        const key = myLines.get(od.range.startLine);
        if (key !== undefined) {
          this.probe.emit(
            "editor.render.decoration.zorder",
            {
              nodeId: key,
              line: od.range.startLine,
              overlapping: [kind, otherKind].sort(),
              resolvedOrder: Z_ORDER.filter((k) => k === kind || k === otherKind),
            },
            deltaRef,
          );
        }
      }
    }

    this.paintsSinceOpen++;
    this.paintsSinceLastEdit++;
    const frame = this.probe.emit(
      "editor.render.frame",
      { reason, decorationsChanged: added + removed > 0, kind },
      deltaRef,
    );
    this.probe.emit(
      "editor.render.paint.count",
      { sinceOpen: this.paintsSinceOpen, sinceLastEdit: this.paintsSinceLastEdit },
      this.probe.ref(frame),
    );
    return frame;
  }

  /** Cursor/scroll-only frames (no decoration change). */
  frameOnly(reason: FrameReason, causeId: string | null = null): ProbeEvent {
    this.paintsSinceOpen++;
    this.paintsSinceLastEdit++;
    const frame = this.probe.emit(
      "editor.render.frame",
      { reason, decorationsChanged: false, kind: null },
      causeId,
    );
    this.probe.emit(
      "editor.render.paint.count",
      { sinceOpen: this.paintsSinceOpen, sinceLastEdit: this.paintsSinceLastEdit },
      this.probe.ref(frame),
    );
    return frame;
  }

  emitViewport(nodeIdsInView: string[], causeId: string | null = null): void {
    const vp = this.adapter.getViewport();
    this.probe.emit(
      "editor.render.viewport",
      {
        firstVisibleLine: vp.firstVisibleLine,
        lastVisibleLine: vp.lastVisibleLine,
        nodeIdsInView: [...nodeIdsInView].sort(),
      },
      causeId,
    );
  }

  /** The full keystroke → didChange → publishDiagnostics → rendered chain. */
  emitKeystrokeLatency(chain: LatencyChain, renderedClock: number, causeId: string | null): void {
    this.probe.emit(
      "editor.latency.keystroke.diagnostic",
      {
        keystrokeClock: chain.keystrokeClock,
        didChangeClock: chain.didChangeClock,
        diagInClock: chain.diagInClock,
        renderedClock,
        endToEndClockDelta: renderedClock - chain.keystrokeClock,
      },
      causeId,
    );
  }

  decorations(): Record<string, Decoration[]> {
    const out: Record<string, Decoration[]> = {};
    for (const [k, v] of this.current) out[k] = v.map((d) => ({ ...d }));
    return out;
  }
}
