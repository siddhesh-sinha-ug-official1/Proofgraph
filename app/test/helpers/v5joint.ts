/**
 * SUB200 restructure (wave 2) — shared fixtures + joint-mount helper for the
 * v5.bus.* seam suites, hoisted VERBATIM from v5.bus.test.tsx.
 *
 * Fixture strategy (logged in REPORT-V5):
 *  - Shared-ID cases (a)/(b)/(c) need ONE node universe visible from both
 *    panes, so the graph wall is served a canonical envelope built from the
 *    editor fixture's OWN canonical nodes (clean.py, ids minted by the real
 *    packages/schema mint) minus `double` — giving byte-identical shared ids
 *    AND a natural in-universe unknown id (the editor can select `double`;
 *    the graph was never served it).
 *  - The brief-literal skeleton.schema.json mount exercises case (d) in both
 *    directions: every editor id is unknown to the skeleton graph and every
 *    skeleton id is unknown to the editor file — no-crash proven both ways.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";

import { createJoinedBus, type JoinedBus } from "../../src/busAdapter";

// Editor-shell wall + sanctioned stubs (imported from OUTSIDE the cell).
import { createEditorWall, type EditorWall } from "@editor-shell/src/wall.js";
import type { SchemaNode } from "@editor-shell/src/schema/schema.js";
import { StubEditorAdapter } from "@editor-shell/test/stub/stub-adapter.js";
import { StubLanguageServer } from "@editor-shell/test/stub/stub-server.js";
import { createStubCapability } from "@editor-shell/test/stub/stub-capability.js";

// Graph-view wall.
import { createGraphViewWall, type GraphViewWall } from "@graph-view/src/wall";

// ── fixture loading (byte-for-byte the cells' own fixtures) ─────────────────
const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const ED_FIXTURES = p("../../../packages/editor-shell/test/fixtures/");
const GV_FIXTURES = p("../../../packages/graph-view/fixtures/");

export const cleanMeta = JSON.parse(readFileSync(ED_FIXTURES + "fixture-meta.json", "utf8"))["clean.py"];
export const cleanBytes = new Uint8Array(readFileSync(ED_FIXTURES + "clean.py"));
// Two INDEPENDENT parses — shared ids are equal strings, not shared references,
// so `===` in the suites proves byte-level content identity across the seam.
export const editorNodes = JSON.parse(readFileSync(ED_FIXTURES + "schema-nodes.json", "utf8"))["clean.py"] as SchemaNode[];
const envelopeNodes = JSON.parse(readFileSync(ED_FIXTURES + "schema-nodes.json", "utf8"))["clean.py"] as unknown[];
export const skeletonEnvelope = JSON.parse(readFileSync(GV_FIXTURES + "skeleton.schema.json", "utf8"));

const idOf = (name: string): string => {
  const n = editorNodes.find((x) => x.name === name);
  if (!n) throw new Error(`no fixture node named ${name}`);
  return n.id;
};
export const ADD = idOf("add");
export const DOUBLE = idOf("double");
export const UNUSED = idOf("unused_helper");

/** Canonical envelope for the shared-universe mounts: clean.py's own canonical
 *  nodes minus `double` (the natural unknown id), no edges, no leads.
 *  Deep-cloned per mount so no test can mutate another's served payload. */
export const sharedEnvelope = () => JSON.parse(JSON.stringify({
  schemaVersion: "v0",
  nodes: envelopeNodes.filter((n) => (n as { id: string }).id !== DOUBLE),
  edges: [],
  leads: [],
}));

// Caret positions (1-based line/column, UTF-16 columns; clean.py is pure ASCII, LF):
// add spans bytes [0,32) → line 1; double [34,70) → line 5; both hit at column 5.
export const CARET_ADD = { line: 1, column: 5 };
export const CARET_DOUBLE = { line: 5, column: 5 };

// ── joint mount helper ───────────────────────────────────────────────────────
export interface Joint {
  joined: JoinedBus;
  editorWall: EditorWall;
  editorAdapter: StubEditorAdapter;
  graphWall: GraphViewWall;
}
const open: Joint[] = [];

export async function mountJoint(envelope: unknown): Promise<Joint> {
  const joined = createJoinedBus();

  const server = new StubLanguageServer({
    meta: {
      bomBytes: cleanMeta.bomBytes,
      diagnosticRules: cleanMeta.diagnosticRules,
      symbols: cleanMeta.symbols,
      definitions: cleanMeta.definitions,
    },
  });
  const { capability } = createStubCapability({ tier: "CT", server, languageId: cleanMeta.languageId });
  const editorAdapter = new StubEditorAdapter();

  const editorWall = await createEditorWall({
    adapter: editorAdapter,
    capability,
    bus: joined.editorSide, // ← the join: T4's cfg.bus IS the adapter's editor face
    schemaNodes: editorNodes,
    file: { uri: cleanMeta.uri, bytes: cleanBytes, languageId: cleanMeta.languageId, lang: cleanMeta.lang },
    connector: { maxReconnectAttempts: 2, backoffMs: [0, 0] },
    wallClock: () => null,
  });

  const graphWall = await createGraphViewWall(envelope, joined.graphSide); // ← the join, far side

  const joint = { joined, editorWall, editorAdapter, graphWall };
  open.push(joint);
  return joint;
}

/** Registers the original per-test teardown (call at test-file top level). */
export function registerJointTeardown(): void {
  afterEach(async () => {
    for (const j of open.splice(0)) {
      j.graphWall.cell.controller.dispose();
      await j.editorWall.dispose("v5 test teardown");
    }
  });
}

// ── pin helpers (read through wall.pins ONLY) ────────────────────────────────
export type AnyEvent = { probeId: string; payload: unknown };
export const of = (events: AnyEvent[], probeId: string) => events.filter((e) => e.probeId === probeId);
export const lastPayload = <T,>(events: AnyEvent[], probeId: string): T => {
  const hits = of(events, probeId);
  if (hits.length === 0) throw new Error(`no ${probeId} on the pin stream`);
  return hits[hits.length - 1].payload as T;
};
