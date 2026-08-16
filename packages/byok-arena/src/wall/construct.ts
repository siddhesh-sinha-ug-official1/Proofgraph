// ============================================================================
// Phase-1 WALL — construction half: createByokWall(config) with its two
// construction gates (insecure-master-secret, schema-absence-violated) and
// the provider-dispatch face over the cell's own machinery. Types + failure
// classes live in ./types.ts; ../wall.ts is the facade that re-exports both
// halves. See ../wall.ts for the full membrane rationale.
// ============================================================================

import { createCell } from "../index.ts";
import type { Provider, Usage } from "../interface.ts";
import type {
  ByokWall, ByokWallConfig, WallChatRequest, WallSubmitRequest, WallValidateKeyResult,
} from "./types.ts";
import { INSECURE_DEV_MASTER_SECRET, WALL_VERSION, WallRefusal } from "./types.ts";
import type { ChatResult } from "../interface.ts";

const PROVIDERS: readonly Provider[] = ["anthropic", "openai", "gemini"];

export function createByokWall(config: ByokWallConfig): ByokWall {
  // ---- gate 1: insecure-master-secret --------------------------------------
  // Decided BEFORE any cell exists (a vault must never be constructed on a
  // refused secret), so the refuse branch is a typed throw, not a probe; the
  // accept branch is probed right after construction (wall.masterSecret.gate).
  const secret = config?.masterSecret;
  const secretText =
    typeof secret === "string" ? secret
      : Buffer.isBuffer(secret) ? secret.toString("utf8")
      : "";
  if (secret === undefined || secret === null || secretText.length === 0) {
    throw new WallRefusal("insecure-master-secret",
      "masterSecret is REQUIRED at the wall (the cell keeps its dev default for standalone runs; the assembled face does not)");
  }
  if (secretText === INSECURE_DEV_MASTER_SECRET) {
    throw new WallRefusal("insecure-master-secret",
      `the cell's dev default ("...CHANGE-ME") is refused at the wall — inject a real secret`);
  }

  // ---- wrap the cell (delegation, not reimplementation) --------------------
  const cell = createCell({
    masterSecret: secret,
    ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    ...(config.retry ? { retry: config.retry } : {}),
    ...(config.now ? { now: config.now } : {}),
    ...(config.nanoClock ? { nanoClock: config.nanoClock } : {}),
  });

  cell.bus.emit("wall.masterSecret.gate", "wall", "decision", {
    accepted: true,
    reason: "injected masterSecret is non-empty and differs from the cell's dev default",
    branchNotTaken: "refuse — failure class insecure-master-secret (dev default / empty / missing); throws before any cell exists",
  });

  // ---- gate 2: schema absence STAYS (this cell's analogue of the PIN assert)
  const catalog = cell.probeCatalog();
  const nodeEdgeKindEntries = catalog
    .filter((entry) => entry.kind === "node" || entry.kind === "edge")
    .map((entry) => entry.probeId);
  const schemaLeads = catalog
    .filter((entry) => entry.probeId.startsWith("schema."))
    .map((entry) => entry.probeId);
  const schemaAbsent = nodeEdgeKindEntries.length === 0 && schemaLeads.length === 0;
  cell.bus.emit("wall.schemaAbsence.gate", "wall", "decision", {
    schemaAbsent,
    nodeEdgeKindEntries,
    schemaLeads,
    reason: schemaAbsent
      ? "byok-arena mints no graph elements and imports no schema — the ABSENCE is this cell's pin, asserted to hold at wall construction (import-boundary gate enforces the static side)"
      : "schema material appeared in a schema-absent-by-design cell",
  });
  if (!schemaAbsent) {
    const err = new WallRefusal("schema-absence-violated",
      `schema material in a schema-absent cell: node/edge kinds [${nodeEdgeKindEntries.join(", ")}], schema leads [${schemaLeads.join(", ")}]`);
    cell.bus.recordError(err);
    throw err;
  }

  cell.bus.emit("wall.construct", "wall", "decision", {
    wallVersion: WALL_VERSION,
    masterSecretAccepted: true,
    schemaAbsent: true,
    catalogSize: catalog.length,
  });

  // ---- provider dispatch with a named failure class -------------------------
  function adapterFor(method: string, provider: Provider) {
    if (!PROVIDERS.includes(provider)) {
      cell.bus.emit("wall.reject", "wall", "branch", {
        failureClass: "unknown-provider",
        method,
        provider: String(provider),
        reason: `provider must be one of ${PROVIDERS.join("|")}`,
      });
      const err = new WallRefusal("unknown-provider",
        `${method}: unknown provider "${String(provider)}" (have ${PROVIDERS.join("|")})`);
      cell.bus.recordError(err);
      throw err;
    }
    return cell.adapters[provider];
  }

  return {
    async validateKey(provider: Provider, apiKey: string): Promise<WallValidateKeyResult> {
      const adapter = adapterFor("validateKey", provider);
      cell.bus.emit("wall.call", "wall", "call", { method: "validateKey", provider });
      // Honest ceiling passes through untouched: valid ≠ spendable — the
      // adapter's honestCeiling pin says spendable:"unknown" and the wall
      // never upgrades that to any green/billable claim.
      return adapter.validateKey(apiKey);
    },

    async chat(provider: Provider, req: WallChatRequest): Promise<ChatResult> {
      const adapter = adapterFor("chat", provider);
      cell.bus.emit("wall.call", "wall", "call", { method: "chat", provider });
      return adapter.chat(req);
    },

    async submitToolResults(provider: Provider, req: WallSubmitRequest): Promise<ChatResult> {
      const adapter = adapterFor("submitToolResults", provider);
      cell.bus.emit("wall.call", "wall", "call", { method: "submitToolResults", provider });
      return adapter.submitToolResults(req);
    },

    estimateCost(provider: Provider, model: string, usage: Usage): number {
      adapterFor("estimateCost", provider);
      cell.bus.emit("wall.call", "wall", "call", { method: "estimateCost", provider });
      // Unpriced models stay explicitly 0 via cost.estimate.unpricedModel —
      // the wall never fabricates a price (honest ceiling).
      return cell.estimateCost(provider, model, usage);
    },

    pins: {
      probeCatalog: () => cell.probeCatalog(),
      dump: () => cell.dump(),
      history: () => cell.history(),
      tap: (probeId, fn) => cell.tap(probeId, fn),
      runSecretLeakScan: () => cell.runSecretLeakScan(),
    },
  };
}
