/**
 * Walking-skeleton smoke test (§8 acceptance, condensed): mount → buffer →
 * connect → didOpen → diagnostics → verdict gutter → brushing, all proved by
 * probe reads, not eyeballs. The dedicated §9 suites go deeper per property.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, nodeByName } from "./stub/harness.js";
import {
  assertFired,
  assertNeverFired,
  lastPayload,
  payloadsOf,
} from "./stub/assert-probes.js";

test("walking skeleton: open → diagnostics → verdict → brushing (type-error.py)", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  // 1. Mount ready, JetBrains Mono resolved (probe read, not an assumption).
  assertFired(bus, "editor.mount.wrapper.ready");
  assert.equal(lastPayload(bus, "editor.mount.font.applied").resolved, "JetBrains Mono");

  // 2. Byte-exact open; zero silent mutations.
  assert.equal(lastPayload(bus, "editor.buffer.roundtrip.check").equalBytes, true);
  assertNeverFired(bus, "editor.buffer.mutation.silent");

  // 3. Handshake: utf-8 accepted; didOpen carried version 1.
  const nego = lastPayload(bus, "editor.conn.positionEncoding.negotiate");
  assert.equal(nego.accepted, "utf-8");
  assert.equal(lastPayload(bus, "editor.lsp.out.didOpen").version, 1);

  // 4. The injected error landed byte-exactly (fixture expected span).
  const spans = payloadsOf(bus, "editor.diag.map.span");
  const errSpan = spans.find((s) => (s.byteStart as number) === h.meta.expected.errorByteStart);
  assert.ok(errSpan, `no diag span at expected byte ${h.meta.expected.errorByteStart}; saw ${JSON.stringify(spans.map((s) => s.byteStart))}`);
  assert.equal(errSpan!.byteEnd, h.meta.expected.errorByteEnd);
  assertNeverFired(bus, "editor.diag.map.mismatch");
  assertFired(bus, "editor.diag.marker.set");

  // 5. Verdicts: broken shows live red over stale schema green (conflict logged);
  //    add is honestly green at tier CT.
  const broken = nodeByName(h.nodes, "broken");
  const add = nodeByName(h.nodes, "add");
  const paints = payloadsOf(bus, "editor.verdict.gutter.paint");
  assert.equal(paints.filter((p) => p.nodeId === broken.id).at(-1)!.status, "red");
  assert.equal(paints.filter((p) => p.nodeId === add.id).at(-1)!.status, "green");
  assertFired(bus, "editor.verdict.conflict");

  // 6. Brushing both directions with byte-identical ids.
  const addIdx = h.cell.index().getById(add.id)!;
  h.adapter.moveCursor({ line: addIdx.monacoRange.startLine, column: addIdx.monacoRange.startColumn + 4 });
  const emitted = lastPayload(bus, "editor.select.emit.bus") as { busEvent: { nodeId: string } };
  assert.equal(emitted.busEvent.nodeId, add.id);
  assert.equal(h.graph.heardFromEditor().at(-1)?.nodeId, add.id);

  const brokenNode = nodeByName(h.nodes, "broken");
  h.graph.select(brokenNode.id);
  const reveal = lastPayload(bus, "editor.select.recv.reveal");
  assert.equal(reveal.nodeId, brokenNode.id);
  assert.equal(reveal.highlightApplied, true);

  // 7. Introspection returns real data; every fired lead is cataloged.
  const catalog = h.cell.probeCatalog();
  assert.ok(catalog.length >= 100, `catalog has ${catalog.length} leads`);
  const catalogIds = new Set(catalog.map((c) => c.probeId));
  for (const id of bus.firedProbeIds()) {
    assert.ok(catalogIds.has(id), `fired probe ${id} missing from catalog`);
  }
  const dump = h.cell.dump() as { modelState: { sha256: string } };
  assert.equal(dump.modelState.sha256, h.meta.sha256);

  await h.cell.dispose();
  assertFired(bus, "editor.lsp.out.didClose");
});
