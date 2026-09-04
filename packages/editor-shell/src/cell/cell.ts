/**
 * The editor-shell cell — composition root.
 *
 * Wires S0 mount → S1 buffer → S2 conn → S3 pump → S4 diagnostics → S5 verdict
 * → S6 selection → S7 map → S8 render over one ProbeBus (S8b), against any
 * EditorAdapter. This is the object tests and the demo both drive; it exposes
 * the four introspection entry points (probeCatalog/dump/tap/history) and the
 * bus seam Tree 5 docks to. Everything stays exposed; since ASSEMBLY Phase 1
 * the membrane exists as ../wall.ts, promoted OVER these pins.
 *
 * SUB200 restructure: the open sequence + node refresh live in ./open.ts, the
 * diagnostics flow in ./diag-flow.ts, per-feature LSP helpers in
 * ./features.ts, introspection in ./introspection.ts, config in ./config.ts.
 * ../cell.ts remains the public path. Members marked @internal are exposed
 * only for those sibling modules — external consumers keep the same surface.
 */

import { ProbeBus, type ProbeEvent, type TapHandler } from "../probe/probe-bus.js";
import type { ProbeSpec } from "../probe/catalog.js";
import type { SchemaNode } from "../schema/schema.js";
import type { Capability } from "../seams/capability.js";
import type { SelectionBus } from "../seams/bus.js";
import type { EditorAdapter, Pos } from "../mount/adapter.js";
import { MountController, type MountConfig } from "../mount/mount.js";
import { BufferManager } from "../buffer/buffer-manager.js";
import { Connector } from "../conn/connector.js";
import { MessagePump, type PublishDiagnosticsParams } from "../lsp/pump.js";
import { DiagnosticsRenderer } from "../diagnostics/diagnostics.js";
import { VerdictEngine } from "../verdict/verdict.js";
import { SelectionBridge } from "../selection/selection.js";
import { SpanIndex } from "../map/span-index.js";
import { RenderTracker, type LatencyChain } from "../render/render.js";
import { DEFAULT_MOUNT, type CellConfig } from "./config.js";
import { openCell, updateSchemaNodesCore } from "./open.js";
import { handleDiagnosticsCore } from "./diag-flow.js";
import {
  completionCore,
  definitionCore,
  documentSymbolCore,
  foldingRangeCore,
  hoverCore,
  semanticTokensCore,
} from "./features.js";
import { dumpCore, historyCore, probeCatalogCore } from "./introspection.js";

export type { CellConfig } from "./config.js";

export class EditorShellCell {
  readonly probe: ProbeBus;
  readonly adapter: EditorAdapter;
  readonly bus: SelectionBus;
  readonly mountConfig: MountConfig;
  readonly buffer: BufferManager;
  readonly pump: MessagePump;
  readonly render: RenderTracker;
  readonly diagnostics: DiagnosticsRenderer;
  readonly mountCtl: MountController;
  connector: Connector | null = null;
  verdict: VerdictEngine | null = null;
  selection: SelectionBridge | null = null;
  /** @internal cell-module state — same fields as the pre-split privates. */
  cfg: CellConfig;
  /** @internal */
  cap: Capability | null = null;
  /** @internal */
  index_: SpanIndex | null = null;
  /** @internal */
  pendingLatency: Partial<LatencyChain> | null = null;
  private disposed = false;

  constructor(cfg: CellConfig) {
    this.cfg = cfg;
    this.probe = new ProbeBus({ cellId: "editor-shell", wallClock: cfg.wallClock });
    this.adapter = cfg.adapter;
    this.bus = cfg.bus;
    this.mountConfig = { ...DEFAULT_MOUNT, ...cfg.mount };
    this.mountCtl = new MountController(this.probe);
    this.buffer = new BufferManager(this.probe, this.adapter);
    this.pump = new MessagePump(this.probe);
    this.render = new RenderTracker(this.probe, this.adapter);
    this.diagnostics = new DiagnosticsRenderer(this.probe, this.render);
  }

  /** The live span index. Throws if used before open() — never a stale default. */
  index(): SpanIndex {
    if (!this.index_) throw new Error("cell: index not built (open() first)");
    return this.index_;
  }

  /** Walking-skeleton open — see ./open.ts for the full sequence. */
  async open(): Promise<void> {
    return openCell(this);
  }

  /** @internal */
  handleDiagnostics(params: PublishDiagnosticsParams, causeRef: string): void {
    handleDiagnosticsCore(this, params, causeRef);
  }

  /** @internal */
  repaintVerdicts(causeRef: string | null): ProbeEvent {
    if (!this.verdict) throw new Error("cell: verdict engine not initialized (open() first)");
    return this.verdict.paintAll(
      this.index(),
      (nodeId) => this.diagnostics.forNode(nodeId),
      causeRef,
    );
  }

  // ── Per-feature LSP helpers (thickening layer; cataloged leads) ───────────

  async hover(pos: Pos): Promise<unknown | null> {
    return hoverCore(this, pos);
  }

  async definition(pos: Pos): Promise<unknown | null> {
    return definitionCore(this, pos);
  }

  async completion(pos: Pos): Promise<unknown | null> {
    return completionCore(this, pos);
  }

  async foldingRange(): Promise<unknown | null> {
    return foldingRangeCore(this);
  }

  async semanticTokens(): Promise<unknown | null> {
    return semanticTokensCore(this);
  }

  async documentSymbol(): Promise<unknown | null> {
    return documentSymbolCore(this);
  }

  /** ASSEMBLY Phase 1 (wall) — the node-refresh path; see ./open.ts. */
  updateSchemaNodes(nodes: SchemaNode[], causeId: string | null = null): ProbeEvent {
    return updateSchemaNodesCore(this, nodes, causeId);
  }

  // ── Introspection entry points (all return real data) ─────────────────────

  probeCatalog(): ProbeSpec[] {
    return probeCatalogCore(this);
  }

  dump(): unknown {
    return dumpCore(this);
  }

  history(): ProbeEvent[] {
    return historyCore(this);
  }

  tap(probeId: string, handler: TapHandler): () => void {
    return this.probe.tap(probeId, handler);
  }

  async dispose(reason = "cell.dispose()"): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      if (this.connector?.state.phase === "open") {
        this.pump.notify("textDocument/didClose", {
          textDocument: { uri: this.cfg.file.uri },
        });
        await this.pump.request("shutdown", null);
        this.pump.notify("exit", null);
      }
    } catch (err) {
      // dispose is best-effort; transport may already be gone.
      this.probe.emit("editor.conn.transport.state",
        { phase: "dispose-error", detail: String(err) }, null);
    }
    this.selection?.dispose();
    this.connector?.dispose();
    this.buffer.dispose();
    this.mountCtl.dispose(this.cfg.file.uri, reason);
    this.adapter.dispose();
  }
}

export function createEditorShellCell(cfg: CellConfig): EditorShellCell {
  return new EditorShellCell(cfg);
}
