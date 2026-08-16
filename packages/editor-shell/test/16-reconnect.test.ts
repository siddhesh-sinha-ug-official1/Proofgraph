/**
 * §9.16 — failure class: SILENT GIVE-UP.
 *
 * A dropped transport must reconnect LOUDLY: every attempt probed with the
 * cap visible ({attempt, maxAttempts}), success re-opens the document
 * (didOpen re-sent — the server lost its document state) and diagnostics
 * resume. Cap exhaustion must end in a final transport.state {phase:"closed"}
 * whose detail NAMES the cap — never a quiet stall. dispose() must didClose
 * the document so no server-side state leaks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";

/** The reconnect loop resumes on microtasks after handle.connect() resolves. */
async function drainMicrotasks(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

test("silent give-up: transport drop ⇒ loud reconnect (cap visible), re-didOpen on the new wire, diagnostics resume", async () => {
  const h = await openTestCell("type-error.py"); // harness connector: {maxReconnectAttempts: 2, backoffMs: [0, 0]}
  const bus = h.cell.probe;
  const countOf = (id: string): number => eventsOf(bus, id).length;

  assert.equal(h.capInfo.connectCalls, 1, "precondition: exactly one connect at open");
  assert.equal(countOf("editor.lsp.out.didOpen"), 1, "precondition: exactly one didOpen at open");
  const diagBatchesBefore = countOf("editor.lsp.in.diagnostics");
  const markersBefore = countOf("editor.diag.marker.set");
  assert.ok(diagBatchesBefore >= 1, "precondition: diagnostics flowed before the drop");

  h.server.dropTransport();
  await drainMicrotasks();

  // (a) Reconnect probed, with the CAP visible on the attempt payload.
  const recon = payloadsOf<{ attempt: number; maxAttempts: number }>(bus, "editor.conn.reconnect");
  assert.equal(recon.length, 1, `expected exactly one reconnect attempt, probed ${recon.length}`);
  assert.equal(recon[0].attempt, 1, `first reconnect attempt numbered ${recon[0].attempt}, not 1`);
  assert.equal(recon[0].maxAttempts, 2, "maxAttempts (the cap) must be VISIBLE on every reconnect probe");

  // (b) Reconnect succeeded: transport open again on a second connect call.
  // Each successful connect probes "open" twice — wire-open ("handshake
  // pending") then session-open ("handshake complete") — after the review's
  // lifecycle fix: the connector no longer treats a bare wire as a session.
  const phases = payloadsOf<{ phase: string }>(bus, "editor.conn.transport.state").map((s) => s.phase);
  assert.deepEqual(
    phases,
    ["connecting", "open", "open", "closed", "connecting", "open", "open"],
    `transport lifecycle wrong: ${phases.join(" → ")}`,
  );
  assert.equal(h.capInfo.connectCalls, 2, "reconnect must go through handle.connect() a second time");

  // (c) The document was RE-OPENED — the server lost its state with the wire.
  assert.equal(
    countOf("editor.lsp.out.didOpen"),
    2,
    "cell must re-send didOpen after reconnect; the new server session has no document",
  );

  // (d) Diagnostics flow again on the new wire.
  assert.ok(
    countOf("editor.lsp.in.diagnostics") > diagBatchesBefore,
    `no diagnostics batch arrived after reconnect (before: ${diagBatchesBefore}, after: ${countOf("editor.lsp.in.diagnostics")})`,
  );
  assert.ok(
    countOf("editor.diag.marker.set") > markersBefore,
    "diagnostics after reconnect were not rendered to markers",
  );
  const lastGuard = lastPayload<{ action: string; modelVersion: number }>(bus, "editor.diag.version.guard");
  assert.equal(lastGuard.action, "apply", "post-reconnect diagnostics batch was not applied");
  assert.equal(lastGuard.modelVersion, h.adapter.getVersionId());

  // (e) dispose() didCloses the re-opened document — no leaked server state.
  await h.cell.dispose();
  const didClose = payloadsOf<{ uri: string }>(bus, "editor.lsp.out.didClose");
  assert.equal(didClose.length, 1, "dispose must send didClose exactly once");
  assert.equal(didClose[0].uri, h.meta.uri, "didClose must name the document that was opened");
});

test("silent give-up: reconnect cap exhaustion fires exactly maxAttempts loud attempts and a final closed state NAMING the cap", async () => {
  const h = await openTestCell("type-error.py", {
    connector: { maxReconnectAttempts: 2, backoffMs: [0, 0] },
  });
  const bus = h.cell.probe;

  // SPEC NOTE: §9.16 suggests failConnectTimes, but the stub capability fails
  // the FIRST N connect() calls, which would kill the initial open() before a
  // transport ever exists (the reconnect loop only runs after an ESTABLISHED
  // transport drops). To exhaust the cap we instead make every post-drop
  // handle.connect() reject: the stub handle calls server.attach() inside
  // connect(), so a throwing attach fails the connect exactly like a dead server.
  h.server.attach = () => {
    throw new Error("scripted reconnect failure");
  };

  h.server.dropTransport();
  await drainMicrotasks();

  // (a) Exactly maxAttempts reconnect probes, numbered, each showing the cap.
  const recon = payloadsOf<{ attempt: number; maxAttempts: number; backoffMs: number }>(
    bus,
    "editor.conn.reconnect",
  );
  assert.equal(recon.length, 2, `reconnect must fire exactly maxAttempts (2) times, probed ${recon.length}`);
  assert.deepEqual(recon.map((r) => r.attempt), [1, 2], "attempts must be numbered 1..maxAttempts");
  for (const r of recon) {
    assert.equal(r.maxAttempts, 2, "the cap must be VISIBLE on every reconnect attempt probe");
  }

  // (b) Every failed attempt is a probed handshake failure — no silent catch.
  const fails = payloadsOf<{ phase: string; message: string }>(bus, "editor.conn.handshake.fail");
  assert.equal(
    fails.filter((f) => f.phase === "transport-open").length,
    2,
    `each failed reconnect must probe a handshake failure; saw ${JSON.stringify(fails)}`,
  );

  // (c) The FINAL transport state is a loud closed that NAMES the cap.
  const finalState = lastPayload<{ phase: string; detail: string }>(bus, "editor.conn.transport.state");
  assert.equal(finalState.phase, "closed", `final transport phase is ${finalState.phase}, not closed`);
  assert.match(
    finalState.detail,
    /reconnect cap reached \(2 attempts\)/,
    `final closed detail must mention the cap — got "${finalState.detail}" (silent give-up otherwise)`,
  );

  // (d) No didClose here: the wire is gone and the phase is closed — but the
  //     give-up itself was loud, which is the contract under test.
  await h.cell.dispose();
});
