/**
 * vessels/v2_squiggle_drop.mjs — V2 cases 3–4: backend killed mid-session
 * (loud disconnect, bounded retries, no hang) and the teardown/orphan sweep.
 *
 * SUB200 restructure: split out of vessels/test_v2_squiggle.mjs (which stays
 * the `node --test` entry point and imports this module AFTER the squiggle
 * cases, preserving order — teardown runs LAST).  Behavior unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LocalSelectionBus, NODES, StubEditorAdapter, URI,
  connectTransports, createEditorWall, ctx, demoBytes, evts, nodePids, until,
} from "./v2_squiggle_env.mjs";

// ═══ lsp-bridge-drop scenario: kill the backend mid-session ════════════════
test("V2: backend killed mid-session → loud disconnect, no hang", { timeout: 300000 }, async () => {
  const { runner, ready } = ctx;
  const enrichLog = [];
  const wsUrl = `ws://127.0.0.1:${ready.wsPort}/lsp`;
  let connects = 0;
  const capability = () => ({
    tier: ready.faceTier,
    handle: {
      kind: "websocket",
      languageId: "python",
      connect: async () => {
        connects += 1;
        if (connects > 1) {
          // the backend is dead — reconnects are REFUSED, so the editor's
          // bounded-retry / loud-give-up path runs deterministically.
          throw new Error("v2 drop test: backend dead, reconnect refused");
        }
        return connectTransports(wsUrl, enrichLog);
      },
      describe: () => ({ kind: "websocket", url: wsUrl }),
    },
  });

  const wall = await createEditorWall({
    adapter: new StubEditorAdapter(),
    capability,
    bus: new LocalSelectionBus(),
    schemaNodes: NODES,
    file: { uri: URI, bytes: new Uint8Array(demoBytes), languageId: "python", lang: "python" },
    connector: { maxReconnectAttempts: 2, backoffMs: [0, 0] },
    wallClock: () => null,
  });

  try {
    // session live mid-flight: the squiggle arrived again on the fresh child.
    await until(() => evts(wall, "editor.diag.marker.set").length > 0,
      120000, "session-2 diagnostics before the kill", 300);

    const killed = await runner.cmd("kill-backend");
    assert.equal(killed.ok, true);

    // editor side: LOUD give-up (reconnect-cap) / disconnect probes fire —
    // never a silent give-up (contract rule 8); NO hang.
    await until(() => evts(wall, "editor.conn.transport.state")
      .some((e) => String(e.payload.detail).includes("reconnect cap reached")),
      30000, "loud give-up after backend death", 200);

    const recon = evts(wall, "editor.conn.reconnect");
    assert.equal(recon.length, 2, "bounded retries, each one probed");
    assert.deepEqual(recon.map((e) => e.payload.attempt), [1, 2]);
    const fails = evts(wall, "editor.conn.handshake.fail")
      .filter((e) => e.payload.phase === "transport-open");
    assert.equal(fails.length, 2, "every refused reconnect probed, none silent");

    // hub side pins: the child EOF + the kill are on the hub stream.
    const pins = await (await fetch(
      `http://127.0.0.1:${ready.httpPort}/pins/history?limit=100000`)).json();
    assert.ok(pins.hub.events.some((e) => e.probeId === "hub.lsp.backend.kill"));
    assert.ok(pins.hub.events.some((e) => e.probeId === "hub.lsp.backend.eof"));
  } finally {
    await wall.dispose("v2 drop test complete");
  }

  // ledger audit for the killed session: every frame that crossed is
  // accounted for on both sides; a mismatch would be the named class
  // lsp-bridge-drop (its firing path is owned by hub/test_hub.py's
  // LossyEchoBackend gate).
  await until(async () =>
    (await runner.cmd("sessions")).sessions[1]?.closed === true,
    20000, "session 2 closed on the hub");
  const audit = await runner.cmd("audit 1");
  if (!audit.ok) {
    assert.equal(audit.failureClass, "lsp-bridge-drop",
      "a ledger mismatch must carry the named class");
    console.log(`[v2] kill race lost a frame — named loudly: ${JSON.stringify(audit)}`);
  }
});

// ═══ teardown: wall shutdown + no orphaned processes ════════════════════════
test("V2: teardown — wall shutdown, hub stop, zero orphans", { timeout: 120000 }, async () => {
  const { runner } = ctx;
  const down = await runner.cmd("shutdown", 60000);
  assert.equal(down.ok, true);
  assert.ok(down.wallShutdownPin, "capability.wall.shutdown pin emitted");
  assert.equal(down.wallShutdownPin.terminated, true,
    "wall shutdown pin: LSP child terminated");
  assert.notEqual(down.childExitCode, null, "child process is dead");

  const exitCode = await runner.exited;
  assert.equal(exitCode, 0, `runner exit 0; stderr: ${runner.stderr.slice(-2000)}`);

  // orphan sweep vs the pre-run baseline (V1/gate-16 discipline, 20s window).
  await until(() => {
    const now = nodePids();
    const orphans = [...now].filter((pid) => !ctx.baselineNodePids.has(pid));
    if (orphans.length === 0) return true;
    return false;
  }, 20000, "no new node.exe processes remain (pyright tree fully dead)", 1000);
});
