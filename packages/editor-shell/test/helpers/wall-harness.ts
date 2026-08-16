/**
 * Wall-conformance shared harness (SUB200 restructure: split from
 * 22-wall-conformance.test.ts, verbatim): mount a fully wired wall over the
 * stub tier and read pin-level truth.
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createEditorWall, type EditorWall } from "../../src/wall.js";
import type { ProbeEvent } from "../../src/probe/probe-bus.js";
import type { SchemaNode } from "../../src/schema/schema.js";
import type { DepthTier } from "../../src/seams/capability.js";
import { LocalSelectionBus } from "../../src/seams/bus.js";
import { loadFixture } from "../stub/harness.js";
import { StubEditorAdapter } from "../stub/stub-adapter.js";
import { StubLanguageServer } from "../stub/stub-server.js";
import { createStubCapability } from "../stub/stub-capability.js";

// dist/test/helpers/wall-harness.js → cell root is three levels up.
const CELL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const SCHEMA_PKG = join(CELL_ROOT, "..", "schema");

export async function importCanonical(rel: string): Promise<any> {
  return import(pathToFileURL(join(SCHEMA_PKG, rel)).href);
}

// ── Pin readers: the conformance tests assert through wall.pins ONLY. ────────
export function eventsOf(wall: EditorWall, probeId: string): ProbeEvent[] {
  return wall.pins.history().filter((e) => e.probeId === probeId);
}
export function payloadsOf<T = Record<string, any>>(wall: EditorWall, probeId: string): T[] {
  return eventsOf(wall, probeId).map((e) => e.payload as T);
}
export function lastPayload<T = Record<string, any>>(wall: EditorWall, probeId: string): T {
  const all = payloadsOf<T>(wall, probeId);
  assert.ok(all.length > 0, `expected at least one "${probeId}" probe in the pins, saw none`);
  return all[all.length - 1];
}

/** Mount a fully wired wall over the stub tier for one fixture. */
export async function mountWall(
  fixtureName: string,
  opts: { tier?: DepthTier; schemaNodes?: SchemaNode[] } = {},
): Promise<{
  wall: EditorWall;
  adapter: StubEditorAdapter;
  bus: LocalSelectionBus;
  nodes: SchemaNode[];
  meta: ReturnType<typeof loadFixture>["meta"];
}> {
  const { bytes, meta, nodes } = loadFixture(fixtureName);
  const server = new StubLanguageServer({
    meta: {
      bomBytes: meta.bomBytes,
      diagnosticRules: meta.diagnosticRules,
      symbols: meta.symbols,
      definitions: meta.definitions,
    },
  });
  const { capability } = createStubCapability({
    tier: opts.tier ?? "CT",
    server,
    languageId: meta.languageId,
  });
  const adapter = new StubEditorAdapter();
  const bus = new LocalSelectionBus();
  const wall = await createEditorWall({
    adapter,
    capability,
    bus,
    schemaNodes: opts.schemaNodes ?? nodes,
    file: { uri: meta.uri, bytes, languageId: meta.languageId, lang: meta.lang },
    connector: { maxReconnectAttempts: 2, backoffMs: [0, 0] },
    wallClock: () => null, // deterministic histories, as everywhere in this suite
  });
  return { wall, adapter, bus, nodes, meta };
}

/** Last gutter decision per node visible in the pins, from clock `after` on. */
export function lastGutterByNode(wall: EditorWall, after = 0): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of eventsOf(wall, "editor.verdict.gutter.paint")) {
    if (e.logicalClock <= after) continue;
    const p = e.payload as { nodeId: string; status: string };
    out.set(p.nodeId, p.status);
  }
  return out;
}
