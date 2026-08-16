/**
 * Regression pins for the adversarial-review findings — PROTOCOL LENS +
 * REDACTION (part 3 of 3; SUB200 restructure split from
 * 20-review-regressions.test.ts, assertions unchanged).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { redactSecret } from "../src/probe/probe-bus.js";
import { openTestCell } from "./stub/harness.js";
import { eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";

test("wrong document: another file's publishDiagnostics is DROPPED by the uri guard, never painted here", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const markersBefore = eventsOf(bus, "editor.diag.marker.set").length;
  // Drive a cross-URI batch through the server's real wire.
  (h.server as unknown as { send(m: unknown): void }).send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri: "file:///fixtures/OTHER.py",
      version: 1,
      diagnostics: [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, severity: 1, message: "not ours" },
      ],
    },
  });
  const guard = lastPayload<{ action: string; diagUri: string }>(bus, "editor.diag.uri.guard");
  assert.equal(guard.action, "drop");
  assert.equal(guard.diagUri, "file:///fixtures/OTHER.py");
  assert.equal(
    eventsOf(bus, "editor.diag.marker.set").length,
    markersBefore,
    "no marker from the foreign batch",
  );
  await h.cell.dispose();
});

test("lost field: a REVERSED diagnostic range is normalized and probed as malformed, never painted reversed", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  (h.server as unknown as { send(m: unknown): void }).send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri: h.meta.uri,
      version: 1,
      diagnostics: [
        { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 1 } }, severity: 1, message: "reversed" },
      ],
    },
  });
  const err = payloadsOf<{ kind: string; detail: string }>(bus, "editor.lsp.error.protocol")
    .filter((e) => /end < start/.test(e.detail));
  assert.equal(err.length, 1, "reversed range must be probed as malformed");
  const span = lastPayload<{ byteStart: number; byteEnd: number }>(bus, "editor.diag.map.span");
  assert.ok(span.byteStart <= span.byteEnd, "painted span must be normalized");
  await h.cell.dispose();
});

test("silent give-up: requests while disconnected settle immediately with a probe — no infinite await", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;
  // Drop the wire; the reconnect loop suspends at handle.connect() (async),
  // leaving a deterministic disconnected window before re-attach.
  h.server.dropTransport();
  const result = await h.cell.hover({ line: 1, column: 5 });
  // The dead-wire request must RESOLVE (null), not hang forever, and the
  // refusal is a probe — no probe may claim a send that never happened.
  assert.equal(result, null);
  const errs = payloadsOf<{ kind: string }>(bus, "editor.lsp.error.protocol");
  assert.ok(
    errs.some((e) => e.kind === "sendWhileDisconnected"),
    "the dead-wire request path must be probed as sendWhileDisconnected",
  );
  // After the reconnect completes, requests flow again on the new wire.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const after = await h.cell.hover({ line: 1, column: 5 });
  assert.ok(after !== null, "hover must work again once the reconnect re-attached");
  await h.cell.dispose();
});

test("secret leak: redactSecret never returns last-4 of a short secret", () => {
  assert.deepEqual(redactSecret("abcd"), { secretPresent: true, secretLast4: null });
  assert.deepEqual(redactSecret("12345678"), { secretPresent: true, secretLast4: null });
  assert.deepEqual(redactSecret("a-much-longer-token"), { secretPresent: true, secretLast4: "oken" });
  assert.deepEqual(redactSecret(null), { secretPresent: false, secretLast4: null });
});
