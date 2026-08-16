/**
 * vessels/v2_squiggle_cases.mjs — V2 cases 1–2: measured-tier honesty and
 * the end-to-end squiggle with pins×pins assertions across the boundary.
 *
 * SUB200 restructure: split out of vessels/test_v2_squiggle.mjs (which stays
 * the `node --test` entry point and imports this module).  Shared fixture,
 * hub lifecycle and helpers live in v2_squiggle_env.mjs.  Behavior unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BROKEN_ID, LocalSelectionBus, NODES, SHOUT_ID, StubEditorAdapter, URI,
  connectTransports, createEditorWall, ctx, demoBytes, evts,
  expectedByteEnd, expectedByteStart, until,
} from "./v2_squiggle_env.mjs";

// ═══ the end-to-end squiggle ════════════════════════════════════════════════
test("V2: measured tier honesty (face == pin, byte-equal)", () => {
  // The runner refuses to come up on a face/pin mismatch (silent-tier-upgrade
  // guard); here we re-assert the evidence it shipped.
  const ready = ctx.ready;
  assert.equal(typeof ready.faceTier, "string");
  assert.equal(ready.faceTier, ready.pinTier,
    "wall face tier must byte-equal the capability.probe.measuredTier pin");
  assert.equal(ready.faceTier, ready.constructPinTier,
    "capability.wall.construct pin must carry the same tier");
  // No asserted tiers: CT is what V1 measured on this machine; if the battery
  // honestly lands lower, diagnostics may still flow — the suite reports it.
  console.log(`[v2] measured python tier: ${ready.faceTier} ` +
    `(paper ${ready.paperTier}, p2=${ready.batteryP2}, ` +
    `greenAllowed=${ready.greenAllowed})`);
});

test("V2: squiggle end-to-end + pins×pins across the boundary", { timeout: 300000 }, async () => {
  const { runner, ready } = ctx;
  const enrichLog = [];
  const wsUrl = `ws://127.0.0.1:${ready.wsPort}/lsp`;
  let transports = null;
  const capability = () => ({
    tier: ready.faceTier,           // cell 2's MEASURED tier, never asserted
    handle: {
      kind: "websocket",
      languageId: "python",
      connect: async () => {
        transports = await connectTransports(wsUrl, enrichLog);
        return transports;
      },
      describe: () => ({ kind: "websocket", url: wsUrl }),
    },
  });

  const bus = new LocalSelectionBus();
  const wall = await createEditorWall({
    adapter: new StubEditorAdapter(),
    capability,
    bus,
    schemaNodes: NODES,
    file: { uri: URI, bytes: new Uint8Array(demoBytes), languageId: "python", lang: "python" },
    connector: { maxReconnectAttempts: 2, backoffMs: [0, 0] },
    wallClock: () => null,
  });

  try {
    // ── wait for the squiggle (pyright analysis is async) ────────────────
    await until(() => evts(wall, "editor.diag.marker.set").length > 0,
      120000, "publishDiagnostics → editor.diag.marker.set", 300);

    const hist = wall.pins.history();
    const by = (id) => hist.filter((e) => e.probeId === id);

    // (1) editor pins: the squiggle at the RIGHT byte span, from file bytes.
    const spans = by("editor.diag.map.span");
    assert.equal(spans.length, 1, "exactly one diagnostic mapped");
    assert.equal(spans[0].payload.byteStart, expectedByteStart,
      "squiggle byteStart == byte offset of the type-error expression");
    assert.equal(spans[0].payload.byteEnd, expectedByteEnd,
      "squiggle byteEnd == end of the type-error expression");

    const markers = by("editor.diag.marker.set");
    assert.equal(markers[0].payload.severity, "error");
    assert.match(markers[0].payload.message,
      /Operator "\+" not supported/, "the REAL pyright message");

    // uri + version guards applied (not dropped): pin-level truth.
    const uriGuard = by("editor.diag.uri.guard").at(-1);
    assert.equal(uriGuard.payload.action, "apply");
    assert.equal(uriGuard.payload.diagUri, URI);
    const verGuard = by("editor.diag.version.guard").at(-1);
    assert.equal(verGuard.payload.action, "apply");

    // diagnostic attached to the RIGHT node; gutter decision red (live LSP
    // pushes unknown → red, DOWN only).
    assert.equal(by("editor.diag.node.attach").at(-1).payload.nodeId, BROKEN_ID);
    const paints = by("editor.verdict.gutter.paint");
    const lastPaint = (nid) => paints.filter((e) => e.payload.nodeId === nid).at(-1);
    assert.equal(lastPaint(BROKEN_ID).payload.status, "red",
      "gutter decision: live error pushes the broken node to red");
    assert.equal(lastPaint(SHOUT_ID).payload.status, "unknown",
      "clean node stays unknown — absence of diagnostics is not a verdict");
    const dec = by("editor.verdict.fill.decision")
      .filter((e) => e.payload.nodeId === BROKEN_ID).at(-1);
    assert.equal(dec.payload.source, "lsp-live");

    // honest ceiling: the editor recorded the seam tier verbatim.
    const tierGuard = by("editor.conn.tier.guard").at(-1);
    assert.equal(tierGuard.payload.tier, ready.faceTier);
    assert.equal(tierGuard.payload.liveGreenAllowed, ready.faceTier === "CT");
    const capInput = by("editor.conn.capability.input").at(-1);
    assert.equal(capInput.payload.tier, ready.faceTier,
      "editor pin tier == capability wall pin tier (cross-boundary)");

    // (2) workspace/configuration ROUND-TRIP: editor pin + bridge ledger.
    const cfg = by("editor.lsp.in.configuration");
    assert.ok(cfg.length >= 1, "server→client workspace/configuration reached the editor");
    const sections = cfg.flatMap((e) => e.payload.items.map((i) => i.section));
    assert.ok(sections.includes("python"),
      `pyright asked for python settings (got: ${sections})`);
    assert.equal(enrichLog.length, 1, "the declared initialize enrichment fired exactly once");

    // editor-side outbound didOpen evidence for the cross-check below.
    const didOpen = by("editor.lsp.out.didOpen").at(-1).payload;
    assert.equal(didOpen.uri, URI);
    const inDiag = by("editor.lsp.in.diagnostics").at(-1).payload;
    assert.equal(inDiag.uri, URI);

    // (3) capability-side pins: the SAME uri+version on cell 2's own bus.
    const capPins = await runner.cmd("capability-pins");
    assert.ok(capPins.bridgeMsgCount > 0, "bridge frames pinned on the capability bus");
    assert.equal(capPins.didOpen.uri, didOpen.uri,
      "didOpen uri byte-identical: editor pin × capability pin");
    assert.equal(capPins.didOpen.version, didOpen.version,
      "didOpen version identical across the boundary");
    const capPub = capPins.publishes.find((pub) => pub.count > 0);
    assert.ok(capPub, "capability pins carry the publishDiagnostics frame");
    assert.equal(capPub.uri, inDiag.uri,
      "publishDiagnostics uri byte-identical: capability pin × editor pin");
    assert.equal(capPub.version, inDiag.version,
      "publishDiagnostics version identical across the boundary");
    assert.ok(capPins.configRequests >= 1,
      "capability pins saw the server→client configuration request cross");

    // (4) hub bridge ledger agrees (third witness).
    const si = await runner.cmd("session-info 0");
    assert.equal(si.didOpen.uri, URI);
    assert.equal(si.didOpen.version, didOpen.version);
    assert.ok(si.publishes.some((pub) => pub.uri === URI && pub.count > 0));
    assert.ok(si.configRequests.length >= 1, "bridge ledger: config request s2c");
    const reqIds = si.configRequests.map((r) => r.id);
    const respIds = si.configResponses.map((r) => r.id);
    for (const id of reqIds) {
      assert.ok(respIds.includes(id),
        `configuration request id ${id} answered by the editor (c2s response in ledger)`);
    }

    // (5) hub HTTP /pins aggregation: capability stream attached + hub frames.
    const pins = await (await fetch(
      `http://127.0.0.1:${ready.httpPort}/pins/history?limit=100000`)).json();
    assert.equal(pins.cells["capability-layer"].available, true);
    const capEvents = pins.cells["capability-layer"].events;
    const construct = capEvents.filter((e) => e.probeId === "capability.wall.construct").at(-1);
    assert.equal(construct.payload.tier, ready.faceTier,
      "aggregated capability.wall.construct pin tier == face tier");
    assert.ok(pins.hub.events.some((e) => e.probeId === "hub.lsp.connect"));
    assert.ok(pins.hub.events.filter((e) => e.probeId === "hub.lsp.frame.c2s").length > 0);
    assert.ok(pins.hub.events.filter((e) => e.probeId === "hub.lsp.frame.s2c").length > 0);
  } finally {
    await wall.dispose("v2 session 1 complete");
  }

  // graceful LSP goodbye crossed the bridge (didClose + shutdown + exit).
  const si1 = await runner.cmd("session-info 0");
  assert.equal(si1.c2sMethodCounts["textDocument/didClose"], 1);
  assert.equal(si1.c2sMethodCounts["shutdown"], 1);
  assert.equal(si1.c2sMethodCounts["exit"], 1);

  // bridge audit: nothing lost, reordered, or altered (no lsp-bridge-drop).
  await until(async () =>
    (await runner.cmd("sessions")).sessions[0]?.closed === true,
    20000, "session 1 closed on the hub");
  const audit = await runner.cmd("audit 0");
  assert.equal(audit.ok, true, `session-1 ledger audit: ${JSON.stringify(audit)}`);
});
