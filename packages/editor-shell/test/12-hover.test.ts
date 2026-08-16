/**
 * SPEC §9.12 — failure class: wrong-span feature.
 *
 * Hover is the canonical "wrong-span feature": the tooltip appears but the
 * highlighted range is one column off because the response range was converted
 * with the wrong position encoding. We hover a known identifier, then convert
 * the response range back through the cell's SpanIndex with the NEGOTIATED
 * encoding and demand the identifier's exact byte span — at utf-8 AND when the
 * server forces utf-16. Unadvertised hover must be a loud, logged no-op.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { DEFAULT_STUB_SERVER_CONFIG } from "./stub/stub-server.js";
import { assertFired, assertNeverFired, lastPayload, payloadsOf } from "./stub/assert-probes.js";
import type { PositionEncoding } from "../src/map/span-index.js";

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}
interface HoverRequestPayload {
  id: number;
  uri: string;
  position: { line: number; character: number };
}
interface HoverResponsePayload {
  id: number;
  contents: { kind?: string; value?: string } | null;
  range: LspRange | null;
}

/** Hover `add` in clean.py at its definition and demand the exact byte span back. */
async function hoverAddByteExact(mode: "accept-utf8" | "force-utf16"): Promise<void> {
  const h = await openTestCell("clean.py", { serverCfg: { positionEncodingMode: mode } });
  const bus = h.cell.probe;

  const nego = lastPayload<{ accepted: PositionEncoding }>(bus, "editor.conn.positionEncoding.negotiate");
  assert.equal(nego.accepted, mode === "force-utf16" ? "utf-16" : "utf-8", "negotiation precondition");

  // Caret from the schema truth: definition byte span of `add` → editor Pos.
  const def = h.meta.definitions["add"];
  assert.ok(def, "fixture meta must define `add`");
  const pos = h.cell.index().byteToPos(def.byteStart);
  assert.deepEqual(pos, { line: 1, column: 5 }, "byte 4 of `def add` is line 1, column 5");

  const result = await h.cell.hover(pos);
  assert.ok(result !== null, "hover returned null for a known identifier");

  // Request went out with the encoding-correct LSP position.
  assertFired(bus, "editor.lsp.hover.request");
  const req = lastPayload<HoverRequestPayload>(bus, "editor.lsp.hover.request");
  assert.equal(req.uri, h.meta.uri);
  assert.deepEqual(req.position, { line: 0, character: 4 });

  // Response correlated to the same request and carried a range.
  assertFired(bus, "editor.lsp.hover.response");
  const resp = lastPayload<HoverResponsePayload>(bus, "editor.lsp.hover.response");
  assert.equal(resp.id, req.id, "hover response must correlate to the hover request id");
  assert.ok(resp.range, "hover response carried no range");
  assert.ok(resp.contents?.value?.includes("add"), "hover contents should name the identifier");

  // The whole point: range → bytes through the cell with the NEGOTIATED
  // encoding must equal the identifier's exact byte span — not one column off.
  const enc = nego.accepted;
  const idx = h.cell.index();
  const byteStart = idx.lspPositionToByte(resp.range.start.line, resp.range.start.character, enc);
  const byteEnd = idx.lspPositionToByte(resp.range.end.line, resp.range.end.character, enc);
  assert.equal(byteStart, def.byteStart, `[${mode}] hover span start off by ${byteStart - def.byteStart} byte(s)`);
  assert.equal(byteEnd, def.byteEnd, `[${mode}] hover span end off by ${byteEnd - def.byteEnd} byte(s)`);

  assertNeverFired(bus, "editor.map.encoding.mismatch");
  await h.cell.dispose();
}

test("wrong-span feature: hover on `add` returns the exact definition byte span (clean.py, utf-8)", async () => {
  await hoverAddByteExact("accept-utf8");
});

test("wrong-span feature: hover on `add` stays byte-exact when the server forces utf-16", async () => {
  await hoverAddByteExact("force-utf16");
});

test("wrong-span feature: hover past 🚀→é maps byte-exactly in BOTH encodings (multibyte.py)", async () => {
  for (const mode of ["accept-utf8", "force-utf16"] as const) {
    const h = await openTestCell("multibyte.py", { serverCfg: { positionEncodingMode: mode } });
    const bus = h.cell.probe;
    const enc = lastPayload<{ accepted: PositionEncoding }>(bus, "editor.conn.positionEncoding.negotiate").accepted;
    assert.equal(enc, mode === "force-utf16" ? "utf-16" : "utf-8");

    // `undefined_name` sits after 🚀→é on the same line; its byte span is the
    // fixture's expected error span (57..71). utf-16 units ≠ utf-8 bytes here.
    const wordStart = h.meta.expected.errorByteStart;
    const wordEnd = h.meta.expected.errorByteEnd;
    const pos = h.cell.index().byteToPos(wordStart);
    assert.deepEqual(pos, { line: 3, column: 18 }, "multibyte prefix is 17 utf-16 units → column 18");

    const result = await h.cell.hover(pos);
    assert.ok(result !== null, `[${mode}] hover returned null`);

    const req = lastPayload<HoverRequestPayload>(bus, "editor.lsp.hover.request");
    // On the wire the SAME caret is character 17 (utf-16 units) or 22 (utf-8 bytes).
    assert.equal(req.position.character, mode === "force-utf16" ? h.meta.expected.errorCharUtf16 : 22);

    const resp = lastPayload<HoverResponsePayload>(bus, "editor.lsp.hover.response");
    assert.equal(resp.id, req.id);
    assert.ok(resp.range, `[${mode}] hover response carried no range`);
    const idx = h.cell.index();
    const byteStart = idx.lspPositionToByte(resp.range.start.line, resp.range.start.character, enc);
    const byteEnd = idx.lspPositionToByte(resp.range.end.line, resp.range.end.character, enc);
    assert.equal(byteStart, wordStart, `[${mode}] hover span start off by ${byteStart - wordStart} byte(s) after multibyte prefix`);
    assert.equal(byteEnd, wordEnd, `[${mode}] hover span end off by ${byteEnd - wordEnd} byte(s) after multibyte prefix`);

    assertNeverFired(bus, "editor.map.encoding.mismatch");
    await h.cell.dispose();
  }
});

test("wrong-span feature: unadvertised hover ⇒ null result + editor.lsp.capability.unsupported, and NO request leaves the pump", async () => {
  const h = await openTestCell("clean.py", {
    serverCfg: { advertise: { ...DEFAULT_STUB_SERVER_CONFIG.advertise, hover: false } },
  });
  const bus = h.cell.probe;

  // The connector recorded the server's honesty: hoverProvider is off.
  assert.equal(
    lastPayload<{ hoverProvider: boolean }>(bus, "editor.conn.capabilities.server").hoverProvider,
    false,
  );

  const result = await h.cell.hover({ line: 1, column: 5 });
  assert.equal(result, null, "hover must return null when the server does not advertise it");

  // The branch is LOGGED, not silent.
  assertFired(bus, "editor.lsp.capability.unsupported");
  const unsup = lastPayload<{ method: string; reason: string }>(bus, "editor.lsp.capability.unsupported");
  assert.equal(unsup.method, "textDocument/hover");
  assert.equal(unsup.reason, "server-does-not-advertise");

  // And the request was suppressed at the pump — nothing hover-shaped went out.
  assertNeverFired(bus, "editor.lsp.hover.request");
  assertNeverFired(bus, "editor.lsp.hover.response");
  assert.ok(
    payloadsOf<{ method: string }>(bus, "editor.lsp.out.request").every((p) => p.method !== "textDocument/hover"),
    "no outbound JSON-RPC hover request may exist",
  );

  await h.cell.dispose();
});
