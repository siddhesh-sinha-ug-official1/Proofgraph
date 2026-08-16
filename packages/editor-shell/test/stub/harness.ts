/**
 * createTestCell — one call to stand up the whole walking skeleton headless:
 * fixture bytes + Tree 1 stub nodes + stub capability/server + stub adapter +
 * local bus with a stub graph pane. Deterministic (wallClock → null).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEditorShellCell, type EditorShellCell } from "../../src/cell.js";
import type { SchemaNode } from "../../src/schema/schema.js";
import type { DepthTier } from "../../src/seams/capability.js";
import type { ConnectorOptions } from "../../src/conn/connector.js";
import type { MountConfig } from "../../src/mount/mount.js";
import type { MountInfo } from "../../src/mount/adapter.js";
import { LocalSelectionBus } from "../../src/seams/bus.js";
import { StubEditorAdapter } from "./stub-adapter.js";
import { StubGraphPane } from "./stub-graph-pane.js";
import { StubLanguageServer, type StubServerConfig } from "./stub-server.js";
import { createStubCapability, type StubCapabilityHandleInfo } from "./stub-capability.js";

// dist/test/stub/harness.js → cell root is three levels up.
const CELL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const FIXTURE_DIR = join(CELL_ROOT, "test", "fixtures");

export interface FixtureMeta {
  uri: string;
  languageId: string;
  lang: string;
  bomBytes: number;
  eol: string;
  byteLength: number;
  sha256: string;
  diagnosticRules: StubServerConfig["meta"]["diagnosticRules"];
  symbols: StubServerConfig["meta"]["symbols"];
  definitions: StubServerConfig["meta"]["definitions"];
  expected: Record<string, number>;
}

export function loadFixture(name: string): {
  bytes: Uint8Array;
  meta: FixtureMeta;
  nodes: SchemaNode[];
} {
  const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, name)));
  const allMeta = JSON.parse(readFileSync(join(FIXTURE_DIR, "fixture-meta.json"), "utf8"));
  const allNodes = JSON.parse(readFileSync(join(FIXTURE_DIR, "schema-nodes.json"), "utf8"));
  const meta = allMeta[name] as FixtureMeta;
  const nodes = (allNodes[name] ?? []) as SchemaNode[];
  if (!meta) throw new Error(`fixture meta missing for ${name} — run npm run gen:fixtures`);
  return { bytes, meta, nodes };
}

export function loadOutlineFixture(): {
  caseName: string;
  worstOf: string[] | null;
  expectedChosen: string;
  expectedStatus: string;
}[] {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, "outline-fixture.json"), "utf8"));
}

export interface TestCellOptions {
  tier?: DepthTier;
  serverCfg?: Partial<StubServerConfig>;
  schemaNodes?: SchemaNode[];
  mount?: Partial<MountConfig>;
  mountInfo?: Partial<MountInfo>;
  connector?: Partial<ConnectorOptions>;
  failConnectTimes?: number;
}

export interface TestCellHandle {
  cell: EditorShellCell;
  adapter: StubEditorAdapter;
  bus: LocalSelectionBus;
  graph: StubGraphPane;
  server: StubLanguageServer;
  capInfo: StubCapabilityHandleInfo;
  meta: FixtureMeta;
  nodes: SchemaNode[];
}

/** Build (but do not open) a fully wired test cell for one fixture. */
export function createTestCell(fixtureName: string, opts: TestCellOptions = {}): TestCellHandle {
  const { bytes, meta, nodes } = loadFixture(fixtureName);
  const server = new StubLanguageServer({
    ...opts.serverCfg,
    meta: {
      bomBytes: meta.bomBytes,
      diagnosticRules: meta.diagnosticRules,
      symbols: meta.symbols,
      definitions: meta.definitions,
      ...(opts.serverCfg?.meta ?? {}),
    },
  });
  const { capability, info: capInfo } = createStubCapability({
    tier: opts.tier ?? "CT",
    server,
    failConnectTimes: opts.failConnectTimes,
    languageId: meta.languageId,
  });
  const adapter = new StubEditorAdapter(opts.mountInfo);
  const bus = new LocalSelectionBus();
  const graph = new StubGraphPane(bus);
  const cell = createEditorShellCell({
    adapter,
    capability,
    bus,
    schemaNodes: opts.schemaNodes ?? nodes,
    file: { uri: meta.uri, bytes, languageId: meta.languageId, lang: meta.lang },
    mount: opts.mount,
    connector: opts.connector ?? { maxReconnectAttempts: 2, backoffMs: [0, 0] },
    wallClock: () => null, // deterministic histories (§9.10)
  });
  return { cell, adapter, bus, graph, server, capInfo, meta, nodes };
}

/** Convenience: build AND open. */
export async function openTestCell(
  fixtureName: string,
  opts: TestCellOptions = {},
): Promise<TestCellHandle> {
  const h = createTestCell(fixtureName, opts);
  await h.cell.open();
  return h;
}

/** Node lookup by name within a fixture's schema nodes. */
export function nodeByName(nodes: SchemaNode[], name: string): SchemaNode {
  const n = nodes.find((x) => x.name === name);
  if (!n) throw new Error(`no schema node named ${name}`);
  return n;
}
