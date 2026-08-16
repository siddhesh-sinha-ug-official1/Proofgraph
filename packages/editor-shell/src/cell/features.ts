/**
 * Per-feature LSP helpers (thickening layer; cataloged leads) — SUB200
 * restructure: split from the EditorShellCell methods, logic and probes
 * verbatim. Each takes the live cell; the class methods delegate 1:1.
 */

import type { Pos } from "../mount/adapter.js";
import type { EditorShellCell } from "./cell.js";

function capabilityGuard(cell: EditorShellCell, method: string, advertised: boolean | undefined): boolean {
  if (!advertised) {
    cell.probe.emit(
      "editor.lsp.capability.unsupported",
      { method, reason: "server-does-not-advertise" },
      null,
    );
    return false;
  }
  return true;
}

function lspPosition(cell: EditorShellCell, pos: Pos): { line: number; character: number } {
  const enc = cell.connector!.state.positionEncoding === "utf-8" ? "utf-8" : "utf-16";
  return cell.index().posToLsp(pos, enc);
}

export async function hoverCore(cell: EditorShellCell, pos: Pos): Promise<unknown | null> {
  if (!capabilityGuard(cell, "textDocument/hover", cell.connector?.state.serverCapabilities?.hoverProvider)) return null;
  const msg = await cell.pump.request("textDocument/hover", {
    textDocument: { uri: cell.cfg.file.uri },
    position: lspPosition(cell, pos),
  });
  return msg.result ?? null;
}

export async function definitionCore(cell: EditorShellCell, pos: Pos): Promise<unknown | null> {
  if (!capabilityGuard(cell, "textDocument/definition", cell.connector?.state.serverCapabilities?.definitionProvider)) return null;
  const msg = await cell.pump.request("textDocument/definition", {
    textDocument: { uri: cell.cfg.file.uri },
    position: lspPosition(cell, pos),
  });
  return msg.result ?? null;
}

export async function completionCore(cell: EditorShellCell, pos: Pos): Promise<unknown | null> {
  if (!capabilityGuard(cell, "textDocument/completion", cell.connector?.state.serverCapabilities?.completionProvider)) return null;
  const msg = await cell.pump.request("textDocument/completion", {
    textDocument: { uri: cell.cfg.file.uri },
    position: lspPosition(cell, pos),
    context: { triggerKind: 1 },
  });
  return msg.result ?? null;
}

export async function foldingRangeCore(cell: EditorShellCell): Promise<unknown | null> {
  if (!capabilityGuard(cell, "textDocument/foldingRange", cell.connector?.state.serverCapabilities?.foldingRangeProvider)) return null;
  const msg = await cell.pump.request("textDocument/foldingRange", {
    textDocument: { uri: cell.cfg.file.uri },
  });
  return msg.result ?? null;
}

export async function semanticTokensCore(cell: EditorShellCell): Promise<unknown | null> {
  if (!capabilityGuard(cell, "textDocument/semanticTokens/full", cell.connector?.state.serverCapabilities?.semanticTokensProvider)) return null;
  const msg = await cell.pump.request("textDocument/semanticTokens/full", {
    textDocument: { uri: cell.cfg.file.uri },
  });
  return msg.result ?? null;
}

/**
 * documentSymbol + reconciliation: the editor's structure view must agree
 * with the schema, or the disagreement is LOGGED (§9.11), never hidden.
 */
export async function documentSymbolCore(cell: EditorShellCell): Promise<unknown | null> {
  if (!capabilityGuard(cell, "textDocument/documentSymbol", cell.connector?.state.serverCapabilities?.documentSymbolProvider)) return null;
  const msg = await cell.pump.request("textDocument/documentSymbol", {
    textDocument: { uri: cell.cfg.file.uri },
  });
  const enc = cell.connector!.state.positionEncoding === "utf-8" ? "utf-8" : "utf-16";
  const idx = cell.index();

  interface Sym {
    name: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    children?: Sym[];
  }
  const flat: Sym[] = [];
  const walk = (arr: Sym[]): void => {
    for (const s of arr) {
      flat.push(s);
      if (s.children) walk(s.children);
    }
  };
  walk((msg.result as Sym[]) ?? []);

  const matched: { symbolName: string; nodeId: string }[] = [];
  const symbolsWithoutNode: { symbolName: string; byteStart: number; byteEnd: number }[] = [];
  const matchedNodeIds = new Set<string>();
  for (const s of flat) {
    const byteStart = idx.lspPositionToByte(s.range.start.line, s.range.start.character, enc);
    const byteEnd = idx.lspPositionToByte(s.range.end.line, s.range.end.character, enc);
    const node = idx
      .allNodes()
      .find((n) => n.span.byteStart === byteStart && n.span.byteEnd === byteEnd);
    if (node) {
      matched.push({ symbolName: s.name, nodeId: node.node.id });
      matchedNodeIds.add(node.node.id);
    } else {
      symbolsWithoutNode.push({ symbolName: s.name, byteStart, byteEnd });
    }
  }
  const nodesWithoutSymbol = idx
    .allNodes()
    .filter((n) => !matchedNodeIds.has(n.node.id))
    .map((n) => n.node.id)
    .sort();
  cell.probe.emit(
    "editor.lsp.documentSymbol.reconcile",
    { matched, symbolsWithoutNode, nodesWithoutSymbol },
    null,
  );
  return msg.result ?? null;
}
