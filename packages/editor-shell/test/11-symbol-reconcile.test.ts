/**
 * §9.11 — documentSymbol ↔ schema reconciliation (failure class: TWO
 * PROJECTIONS DISAGREE). The editor's structure view (LSP documentSymbol) and
 * Tree 1's schema nodes describe the same file; where they agree the spans
 * must reconcile byte-exactly, and where they disagree the disagreement is
 * LOGGED in editor.lsp.documentSymbol.reconcile — never hidden. All
 * assertions read probe payloads.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, nodeByName, type FixtureMeta } from "./stub/harness.js";
import { assertFired, eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";

interface ReconcilePayload {
  matched: { symbolName: string; nodeId: string }[];
  symbolsWithoutNode: { symbolName: string; byteStart: number; byteEnd: number }[];
  nodesWithoutSymbol: string[];
}

type SymbolMeta = FixtureMeta["symbols"][number];

function flattenSymbols(symbols: SymbolMeta[]): SymbolMeta[] {
  const out: SymbolMeta[] = [];
  for (const s of symbols) {
    out.push(s);
    if (s.children) out.push(...flattenSymbols(s.children));
  }
  return out;
}

test("two projections disagree: nested.py — matched symbols reconcile span-exactly to node ids; the extra __str__ symbol is LOGGED, never hidden", async () => {
  const h = await openTestCell("nested.py");
  const bus = h.cell.probe;

  const result = await h.cell.documentSymbol();
  assert.ok(result, "documentSymbol should return the server's symbol tree");

  // The request/response pair fired as probes (the wire is visible).
  assertFired(bus, "editor.lsp.documentSymbol.request");
  const resp = lastPayload<{ symbols: { name: string }[] }>(
    bus,
    "editor.lsp.documentSymbol.response",
  );
  assert.deepEqual(
    resp.symbols.map((s) => s.name),
    ["Shape"],
    "top-level symbol tree root is Shape (children nested underneath)",
  );

  // Exactly one reconcile event — the disagreement ledger.
  const recEvents = eventsOf(bus, "editor.lsp.documentSymbol.reconcile");
  assert.equal(recEvents.length, 1, "reconcile must fire exactly once per documentSymbol call");
  const rec = recEvents[0].payload as ReconcilePayload;

  const shape = nodeByName(h.nodes, "Shape");
  const area = nodeByName(h.nodes, "Shape.area");
  const name = nodeByName(h.nodes, "Shape.name");

  const matchedByName = new Map(rec.matched.map((m) => [m.symbolName, m.nodeId]));
  assert.equal(matchedByName.get("Shape"), shape.id, "Shape symbol must bind to the Shape node id (string-identical)");
  assert.equal(matchedByName.get("area"), area.id, "area symbol must bind to the Shape.area node id");
  assert.equal(matchedByName.get("name"), name.id, "name symbol must bind to the Shape.name node id");
  assert.equal(rec.matched.length, 3, `only the 3 agreeing symbols match; got ${JSON.stringify(rec.matched)}`);

  // Matched means SPAN-EXACT: node span == server symbol byte span, per pair.
  const flatSyms = flattenSymbols(h.meta.symbols);
  for (const m of rec.matched) {
    const sym = flatSyms.find((s) => s.name === m.symbolName);
    assert.ok(sym, `matched symbol ${m.symbolName} missing from fixture meta`);
    const indexed = h.cell.index().getById(m.nodeId);
    assert.ok(indexed, `matched nodeId ${m.nodeId} not in the span index`);
    assert.equal(indexed!.span.byteStart, sym!.byteStart, `${m.symbolName}: byteStart must reconcile exactly`);
    assert.equal(indexed!.span.byteEnd, sym!.byteEnd, `${m.symbolName}: byteEnd must reconcile exactly`);
  }

  // The deliberate extra symbol __str__ has no node — the disagreement is
  // logged with its byte span, not swallowed.
  assert.equal(rec.symbolsWithoutNode.length, 1, `expected exactly one orphan symbol, got ${JSON.stringify(rec.symbolsWithoutNode)}`);
  const extra = rec.symbolsWithoutNode[0];
  assert.equal(extra.symbolName, "__str__");
  const strMeta = flatSyms.find((s) => s.name === "__str__")!;
  assert.equal(extra.byteStart, strMeta.byteStart, "__str__ orphan is logged at the server's exact byteStart");
  assert.equal(extra.byteEnd, strMeta.byteEnd, "__str__ orphan is logged at the server's exact byteEnd");

  // Every nested.py node has a symbol — no disagreement in that direction.
  assert.deepEqual(rec.nodesWithoutSymbol, [], "all nested.py nodes have a matching symbol");

  await h.cell.dispose();
});

test("two projections disagree: clean.py — the module node has no documentSymbol; logged in nodesWithoutSymbol (foreign-file node excluded, not miscounted)", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;

  await h.cell.documentSymbol();

  assertFired(bus, "editor.lsp.documentSymbol.request");
  assertFired(bus, "editor.lsp.documentSymbol.response");

  const recEvents = eventsOf(bus, "editor.lsp.documentSymbol.reconcile");
  assert.equal(recEvents.length, 1);
  const rec = recEvents[0].payload as ReconcilePayload;

  // add / double / unused_helper reconcile to their node ids.
  const matchedByName = new Map(rec.matched.map((m) => [m.symbolName, m.nodeId]));
  assert.equal(matchedByName.get("add"), nodeByName(h.nodes, "add").id);
  assert.equal(matchedByName.get("double"), nodeByName(h.nodes, "double").id);
  assert.equal(matchedByName.get("unused_helper"), nodeByName(h.nodes, "unused_helper").id);
  assert.equal(rec.matched.length, 3);

  // The server offers no module-level symbol → the module NODE is the
  // disagreement, logged by id.
  const moduleNode = nodeByName(h.nodes, "clean");
  assert.deepEqual(
    rec.nodesWithoutSymbol,
    [moduleNode.id],
    "module node without a symbol must be logged in nodesWithoutSymbol",
  );
  assert.deepEqual(rec.symbolsWithoutNode, [], "every clean.py server symbol has a node");

  // foreign_fn lives in another file: excluded from this file's index via the
  // LOGGED multifile branch, so it must NOT be counted as a disagreement here.
  const foreign = nodeByName(h.nodes, "foreign_fn");
  const multifile = payloadsOf<{ nodeId: string }>(bus, "editor.map.multifile");
  assert.ok(
    multifile.some((p) => p.nodeId === foreign.id),
    "foreign-file node exclusion must itself be probed (editor.map.multifile)",
  );
  assert.ok(
    !rec.nodesWithoutSymbol.includes(foreign.id),
    "foreign-file node must not appear in nodesWithoutSymbol",
  );

  await h.cell.dispose();
});
