/**
 * Demo cell wiring + UI helpers (SUB200 restructure: split from main.tsx,
 * logic verbatim): fixture loading, the stub server/capability + real-Monaco
 * cell construction, and the probe-free display helpers.
 *
 * The language server is the in-process stub (Tree 2 stand-in) speaking real
 * JSON-RPC over in-memory transports — swap `createStubCapability` for Tree
 * 2's `capability` and nothing else changes.
 */

import { createEditorShellCell, type EditorShellCell } from "../src/cell.js";
import { LocalSelectionBus } from "../src/seams/bus.js";
import { worstOfVerdict, type SchemaNode } from "../src/schema/schema.js";
import { MonacoEditorAdapter } from "../src/mount/monaco/monaco-adapter.js";
import { StubLanguageServer } from "../test/stub/stub-server.js";
import { createStubCapability } from "../test/stub/stub-capability.js";

import fixtureText from "../test/fixtures/type-error.py?raw";
import allNodes from "../test/fixtures/schema-nodes.json";
import allMeta from "../test/fixtures/fixture-meta.json";

export const FIXTURE = "type-error.py";
export const meta = (allMeta as Record<string, any>)[FIXTURE];
export const nodes = (allNodes as Record<string, SchemaNode[]>)[FIXTURE];

export interface ChipState {
  node: SchemaNode;
  fill: string;
  outline: string;
  selected: boolean;
}

// ASSEMBLY fix (ruling 4): the demo previously carried its OWN rank mirror
// that ranked an unrecognized token BEST (index OUTLINE_WORST_ORDER.length —
// i.e. better than green), contradicting the core. Deleted; the demo now uses
// the shared canonical worstOfVerdict, so demo chips and S5 decideOutline
// agree: unrecognized ranks WORST and renders "unknown", never green.
export function outlineDisplay(n: SchemaNode): string {
  if (n.outline === null) return "not-yet-computed";
  return worstOfVerdict(n.outline.worstOf).status;
}

/** Build the fully wired demo cell over REAL Monaco + the stub tier. */
export function createDemoCell(
  container: HTMLElement,
  bus: LocalSelectionBus,
): EditorShellCell {
  const server = new StubLanguageServer({
    meta: {
      bomBytes: meta.bomBytes,
      diagnosticRules: meta.diagnosticRules,
      symbols: meta.symbols,
      definitions: meta.definitions,
    },
  });
  const { capability } = createStubCapability({
    tier: "CT",
    server,
    languageId: meta.languageId,
  });
  const adapter = new MonacoEditorAdapter(container);
  return createEditorShellCell({
    adapter,
    capability,
    bus,
    schemaNodes: nodes,
    file: {
      uri: meta.uri,
      bytes: new TextEncoder().encode(fixtureText),
      languageId: meta.languageId,
      lang: meta.lang,
    },
  });
}

export function shortPayload(p: unknown): string {
  const s = JSON.stringify(p);
  return s && s.length > 110 ? s.slice(0, 110) + "…" : (s ?? "");
}

/** §7.8 spike instrumentation: expose the cell for console probing. */
export function exposeForSpike(cell: EditorShellCell): void {
  (window as unknown as { pgCell: EditorShellCell }).pgCell = cell;
}
