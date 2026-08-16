/**
 * §9.8 — failure class: WRONG DOCUMENT / LOST FIELD (part 1 of 2; SUB200
 * restructure split — inbound frame classes live in
 * 08b-lsp-inbound.test.ts; assertions unchanged).
 *
 * Every LSP message the cell sends must carry exactly the right identity
 * fields (uri, languageId, version, text length); the negotiated position
 * encoding must be the one actually used downstream in span math; and the raw
 * firehose covers both directions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { assertNeverFired, eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";

test("wrong document: didOpen carries exact {uri, languageId, version:1, textLength == model text length}", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  const didOpen = lastPayload(bus, "editor.lsp.out.didOpen");
  assert.deepEqual(
    didOpen,
    {
      uri: h.meta.uri,
      languageId: h.meta.languageId,
      version: 1,
      textLength: h.adapter.getText().length,
    },
    `didOpen lost or mangled an identity field: ${JSON.stringify(didOpen)}`,
  );

  await h.cell.dispose();
});

test("lost field: didChange.version equals the adapter version of its paired editor.buffer.change (causal chain, not coincidence)", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  h.adapter.simulateUserEdit([{ rangeOffset: 136, rangeLength: 0, text: "# edit\n" }]);

  const dc = eventsOf(bus, "editor.lsp.out.didChange").at(-1)!;
  const dcPayload = dc.payload as { version: number; contentChanges: { text: string }[] };

  // The buffer change that PRODUCED this didChange, found via the causal chain.
  const paired = bus.causeChain(dc).find((c) => c.probeId === "editor.buffer.change");
  assert.ok(paired, "didChange has no editor.buffer.change in its causal chain — pairing lost");
  const pairedVersion = (paired!.payload as { versionId: number }).versionId;

  assert.equal(
    dcPayload.version,
    pairedVersion,
    `didChange.version ${dcPayload.version} != versionId ${pairedVersion} of the buffer.change that caused it`,
  );
  assert.equal(
    dcPayload.version,
    h.adapter.getVersionId(),
    `didChange.version ${dcPayload.version} != adapter version ${h.adapter.getVersionId()}`,
  );
  // Full-text sync: the change body is the whole current model text.
  assert.equal(
    dcPayload.contentChanges[0]?.text,
    h.adapter.getText(),
    "full-text didChange did not carry the current model text — server sees a different document",
  );

  await h.cell.dispose();
});

test("lost field: negotiated position encoding is the one used downstream — accept-utf8 ⇒ every diag span maps in utf-8", async () => {
  const h = await openTestCell("type-error.py"); // default serverCfg: accept-utf8
  const bus = h.cell.probe;

  const nego = lastPayload<{ requested: string; accepted: string; winner: string }>(
    bus,
    "editor.conn.positionEncoding.negotiate",
  );
  assert.equal(nego.requested, "utf-8");
  assert.equal(nego.accepted, "utf-8");
  assert.equal(nego.winner, "utf-8");

  const spans = payloadsOf<{ positionEncoding: string }>(bus, "editor.diag.map.span");
  assert.ok(spans.length >= 2, `expected diag spans for the fixture's error+warning, saw ${spans.length}`);
  for (const s of spans) {
    assert.equal(
      s.positionEncoding,
      nego.winner,
      `diag span mapped in ${s.positionEncoding} but the negotiated winner is ${nego.winner} — spans will land off-by-N`,
    );
  }

  await h.cell.dispose();
});

test("lost field: negotiated position encoding is the one used downstream — force-utf16 ⇒ every diag span maps in utf-16", async () => {
  const h = await openTestCell("type-error.py", {
    serverCfg: { positionEncodingMode: "force-utf16" },
  });
  const bus = h.cell.probe;

  const nego = lastPayload<{ requested: string; accepted: string; winner: string }>(
    bus,
    "editor.conn.positionEncoding.negotiate",
  );
  assert.equal(nego.requested, "utf-8");
  assert.equal(nego.accepted, "utf-16");
  assert.equal(nego.winner, "utf-16");

  const spans = payloadsOf<{ positionEncoding: string }>(bus, "editor.diag.map.span");
  assert.ok(spans.length >= 2, `expected diag spans for the fixture's error+warning, saw ${spans.length}`);
  for (const s of spans) {
    assert.equal(
      s.positionEncoding,
      nego.winner,
      `diag span mapped in ${s.positionEncoding} but the negotiated winner is ${nego.winner}`,
    );
  }
  // Honest utf-16 conversion on this ASCII fixture: the self-check must agree.
  assertNeverFired(bus, "editor.diag.map.mismatch", "utf-16 mapping diverged from byte math");

  await h.cell.dispose();
});

test("silent drop: the raw firehose covers BOTH directions and initialize is timed", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  const directions = new Set(
    payloadsOf<{ direction: string }>(bus, "editor.lsp.raw.frame").map((f) => f.direction),
  );
  assert.ok(directions.has("out"), "no outbound raw frames probed — half the wire is invisible");
  assert.ok(directions.has("in"), "no inbound raw frames probed — half the wire is invisible");

  const timings = payloadsOf<{ method: string; clockDelta: number }>(bus, "editor.lsp.timing.request");
  const init = timings.filter((t) => t.method === "initialize");
  assert.ok(init.length >= 1, "editor.lsp.timing.request never fired for initialize");
  for (const t of init) {
    assert.ok(t.clockDelta >= 0, `initialize timing has negative clockDelta ${t.clockDelta}`);
  }

  await h.cell.dispose();
});
