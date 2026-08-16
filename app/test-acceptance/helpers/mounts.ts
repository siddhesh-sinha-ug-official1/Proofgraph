/**
 * SUB200 restructure (wave 2) — shared joint-mount + pin helpers for the §7
 * acceptance headless suites, hoisted VERBATIM from
 * acceptance.headless.test.tsx (V5 mount + pin discipline credited to
 * app/test/v5.bus.test.tsx; editor on cell 4's own sanctioned stubs).
 */

import { afterEach } from "vitest";

import { createJoinedBus, type JoinedBus } from "../../src/busAdapter";
import { createEditorWall, type EditorWall } from "@editor-shell/src/wall.js";
import type { SchemaNode } from "@editor-shell/src/schema/schema.js";
import { StubEditorAdapter } from "@editor-shell/test/stub/stub-adapter.js";
import { StubLanguageServer } from "@editor-shell/test/stub/stub-server.js";
import { createStubCapability } from "@editor-shell/test/stub/stub-capability.js";
import { createGraphViewWall, type GraphViewWall } from "@graph-view/src/wall";

import {
  CORE_URI, LEAN_MEASURED_TIER, LEAN_URI, coreBytes, editorNodesFor,
  leanBytes, moatServe,
} from "./analyses";

// ── joint mount (V5 pattern; editor on cell 4's own sanctioned stubs) ────────
export interface Joint {
  joined: JoinedBus;
  editorWall: EditorWall;
  editorAdapter: StubEditorAdapter;
  graphWall: GraphViewWall;
}
const open: Joint[] = [];
export const openGraphOnly: GraphViewWall[] = [];
const openEditors: EditorWall[] = [];

export async function mountJoint(envelope: unknown): Promise<Joint> {
  const joined = createJoinedBus();
  const editorAdapter = new StubEditorAdapter();
  // honest floor: cell 4's own stub transport at tier G — no diagnostics
  // claimed (EditorPane's exact wiring when no measured stream is aggregated).
  const { capability } = createStubCapability({
    tier: "G", server: new StubLanguageServer(), languageId: "python",
  });
  const editorWall = await createEditorWall({
    adapter: editorAdapter,
    capability,
    bus: joined.editorSide,
    schemaNodes: editorNodesFor(moatServe),
    file: { uri: CORE_URI, bytes: coreBytes, languageId: "python", lang: "python" },
    connector: { maxReconnectAttempts: 2, backoffMs: [0, 0] },
    wallClock: () => null,
  });
  const graphWall = await createGraphViewWall(envelope, joined.graphSide);
  const joint = { joined, editorWall, editorAdapter, graphWall };
  open.push(joint);
  return joint;
}

export async function mountLeanEditor(nodes: SchemaNode[]): Promise<{ editorWall: EditorWall; adapter: StubEditorAdapter }> {
  const joined = createJoinedBus();
  const adapter = new StubEditorAdapter();
  const { capability } = createStubCapability({
    tier: LEAN_MEASURED_TIER as "CT", server: new StubLanguageServer(), languageId: "lean",
  });
  const editorWall = await createEditorWall({
    adapter,
    capability,
    bus: joined.editorSide,
    schemaNodes: nodes,
    file: { uri: LEAN_URI, bytes: leanBytes, languageId: "lean", lang: "lean" },
    connector: { maxReconnectAttempts: 2, backoffMs: [0, 0] },
    wallClock: () => null,
  });
  openEditors.push(editorWall);
  return { editorWall, adapter };
}

/** Registers the original per-test teardown (call at test-file top level). */
export function registerMountTeardown(): void {
  afterEach(async () => {
    for (const j of open.splice(0)) {
      j.graphWall.cell.controller.dispose();
      await j.editorWall.dispose("acceptance headless teardown");
    }
    for (const w of openGraphOnly.splice(0)) w.cell.controller.dispose();
    for (const e of openEditors.splice(0)) await e.dispose("acceptance headless teardown");
  });
}

// ── pin helpers ──────────────────────────────────────────────────────────────
export type AnyEvent = { probeId: string; payload: unknown; logicalClock?: number };
export const of = (events: AnyEvent[], probeId: string) => events.filter((e) => e.probeId === probeId);
export const lastPayload = <T,>(events: AnyEvent[], probeId: string): T => {
  const hits = of(events, probeId);
  if (hits.length === 0) throw new Error(`no ${probeId} on the pin stream`);
  return hits[hits.length - 1].payload as T;
};
export const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s));
