// ============================================================================
// Phase-1 WALL — types half: version pin, the refused dev secret, the named
// failure classes the wall itself raises, and every face type (config,
// request/result shapes, pins, the ByokWall interface). The construction
// logic lives in ./construct.ts; ../wall.ts is the facade that re-exports
// both halves. See ../wall.ts for the full membrane rationale.
// ============================================================================

import type { Cell, CellOptions } from "../index.ts";
import type { CatalogEntry, ProbeEvent } from "../probe/bus.ts";
import type { LeakScanReport } from "../probe/leakscan.ts";
import type {
  AdapterError, ChatResult, Msg, Provider, ToolDef, Usage,
} from "../interface.ts";

export const WALL_VERSION = "byok-arena-wall/1.0.0";

/** The cell's standalone dev default — REFUSED at the wall, kept by the cell. */
export const INSECURE_DEV_MASTER_SECRET = "byok-arena-dev-master-secret-CHANGE-ME";

// ---- named failure classes the wall itself raises ---------------------------
// (Adapter-level failures pass through UNCHANGED as the cell's AdapterFailure
// with its own taxonomy: invalid_key | rate_limited | quota_exhausted |
// overloaded | bad_request | unknown — the wall never remaps or softens them.)
export type WallFailureClass =
  | "insecure-master-secret"   // dev default / empty / missing masterSecret at construction
  | "unknown-provider"         // face method dispatched to a provider the cell does not have
  | "schema-absence-violated"; // the by-design schema absence stopped holding

export class WallRefusal extends Error {
  readonly failureClass: WallFailureClass;
  constructor(failureClass: WallFailureClass, message: string) {
    super(`${failureClass}: ${message}`);
    this.name = "WallRefusal";
    this.failureClass = failureClass;
  }
}

// ---- config: masterSecret REQUIRED; fetchImpl injectable as today -----------
export interface ByokWallConfig {
  /** REQUIRED. The assembled face never stands on the cell's dev default. */
  masterSecret: string | Buffer;
  /** Injectable transport — golden/fake for tests; live = pass real fetch. */
  fetchImpl?: typeof fetch;
  /** Determinism injection, same as the cell today (tests only need these). */
  retry?: CellOptions["retry"];
  now?: () => Date;
  nanoClock?: () => bigint;
}

// ---- face types: the SAME normalized shapes the cell already speaks ---------
export interface WallChatRequest {
  apiKey: string;
  model: string;
  messages: Msg[];
  tools?: ToolDef[];
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface WallSubmitRequest {
  apiKey: string;
  model: string;
  messages: Msg[];
  results: { toolCallId: string; name: string; output: string; isError?: boolean }[];
  tools?: ToolDef[];
  // Round WC-W4: additive. The chat leg has always honored maxTokens (with a
  // probe on the default substitution) — the continuation leg silently pinned
  // DEFAULT_MAX_TOKENS across all three adapters, so a caller's maxTokens
  // vanished on submitToolResults and truncated the user-visible answer. This
  // field lets callers thread the same bound through; each adapter emits a
  // submit.maxTokens decision probe naming the default substitution when
  // absent (mirrors the adapter.<provider>.chat.maxTokens pattern).
  maxTokens?: number;
}

export interface WallValidateKeyResult {
  valid: boolean;
  models: string[];
  error?: AdapterError;
}

/** Pins stay reachable through the wall — the diagnostic quartet, delegating
 *  to the cell's existing machinery, plus the leak scan (part of this wall's
 *  conformance contract per SEAM-MAP V6). */
export interface WallPins {
  probeCatalog(): CatalogEntry[];
  dump(): ReturnType<Cell["dump"]>;
  history(): ProbeEvent[];
  tap(probeId: string, fn: (e: ProbeEvent) => void): () => void;
  runSecretLeakScan(): LeakScanReport;
}

export interface ByokWall {
  validateKey(provider: Provider, apiKey: string): Promise<WallValidateKeyResult>;
  chat(provider: Provider, req: WallChatRequest): Promise<ChatResult>;
  submitToolResults(provider: Provider, req: WallSubmitRequest): Promise<ChatResult>;
  estimateCost(provider: Provider, model: string, usage: Usage): number;
  pins: WallPins;
}
