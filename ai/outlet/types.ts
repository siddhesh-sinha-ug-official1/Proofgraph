// ============================================================================
// V6 outlet — shared bounds, failure classes, and DATA shapes.
// Split out of ai/service.ts (SUB200 restructure); ai/service.ts remains the
// public facade and re-exports everything defined here. Behavior unchanged.
// ============================================================================

// -- type-only imports: erased at runtime (assembly code may lean on the
//    canonical schema; cell 6 may not — and does not) ------------------------
import type { Graph } from "../../packages/schema/gen/graph-schema.ts";
import type { ByokWall } from "../../packages/byok-arena/src/wall.ts";
import type { ChatResult, Provider, ToolDef, Usage } from "../../packages/byok-arena/src/interface.ts";

// ---- bounds (logged, never silent) ------------------------------------------
export const MAX_TOOL_ROUNDS = 1;               // thin-skeleton bound (V6 brief)
export const TOOL_OUTPUT_MAX_BYTES = 16384;     // per-tool-result payload cap

// ---- named failure classes ---------------------------------------------------
export type OutletFailureClass =
  | "key-leak"
  | "tool-loop-exceeded"
  | "graph-data-stale"
  | "unknown-tool"
  | "lead-in-edges";

export class OutletFailure extends Error {
  readonly failureClass: OutletFailureClass;
  constructor(failureClass: OutletFailureClass, message: string) {
    super(`${failureClass}: ${message}`);
    this.name = "OutletFailure";
    this.failureClass = failureClass;
  }
}

// ---- the DATA shapes the outlet consumes (structural, not imported by cell 6)
/** Canonical envelope as data. `leads` optional (defaults to []). */
export type OutletGraph = Graph;

export interface OutletProvenance {
  /** declared roots (never inferred) — Node.ids */
  roots?: string[];
  /** graph-model wall query("unused") result — Node.ids */
  unused?: string[];
  /** where the provenance came from, e.g. "graph-model-wall.query(unused)" */
  source?: string;
  generatedAt?: string;
  [extra: string]: unknown;
}

// ---- outlet pins (assembly-side probe stream — NOT the cell's bus; the cell's
//      bus hard-rejects uncatalogued ids, and the outlet never emits into it) --
export interface OutletProbeEvent {
  seq: number;
  probeId: string;
  payload: unknown;
}

export interface AskOptions {
  apiKey: string;
  model: string;
  provider?: Provider;      // default "anthropic"
  maxTokens?: number;
}

export interface AskResult {
  text: string;
  provider: Provider;
  model: string;
  stopReason: ChatResult["stopReason"];
  toolRounds: number;
  toolCallsExecuted: { id: string; name: string }[];
  usage: Usage;
  bounds: { maxToolRounds: number; toolOutputMaxBytes: number };
}

export interface AiOutlet {
  ask(question: string, opts: AskOptions): Promise<AskResult>;
  /** The tool seam (ArenaConfig.executeTool-shaped): declared defs + local executor. */
  tools: {
    defs: ToolDef[];
    execute(name: string, args: Record<string, unknown>): { output: string; isError: boolean };
  };
  pins: { history(): OutletProbeEvent[] };
}

export interface AiOutletConfig {
  byokWall: ByokWall;
  graph: OutletGraph;
  provenance: OutletProvenance;
}
