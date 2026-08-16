/**
 * §9.8 — failure class: WRONG DOCUMENT / LOST FIELD (part 2 of 2; SUB200
 * restructure split from 08-lsp-messages.test.ts, assertions unchanged).
 *
 * Every inbound frame class — orphan response, malformed frame, $/progress,
 * window/logMessage, workspace/configuration, unknown server request — is a
 * probed branch, never a silent drop.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { assertFired, lastPayload, payloadsOf } from "./stub/assert-probes.js";
import { MessagePump } from "../src/lsp/pump.js";
import { ProbeBus } from "../src/probe/probe-bus.js";
import { createTransportPair } from "./stub/stub-transport.js";
import type { JsonRpcMessage } from "../src/seams/capability.js";
import { behaviors } from "./helpers/server-behaviors.js";

test("wrong document: an orphan response (id never sent) is a probed correlation branch, not a silent drop", async () => {
  const h = await openTestCell("type-error.py", {
    serverCfg: { behaviors: behaviors({ orphanResponseAfterInit: true }) },
  });
  const bus = h.cell.probe;

  const orphans = payloadsOf<{ id: number | string; reason: string }>(
    bus,
    "editor.lsp.correlate.orphanResponse",
  );
  assert.ok(
    orphans.some((o) => o.id === 999_999),
    `orphan response id 999999 was not probed; saw ${JSON.stringify(orphans)}`,
  );

  await h.cell.dispose();
});

test("lost field: a malformed frame emits editor.lsp.error.protocol {kind:'malformed'} (raw pump over a bare transport pair)", () => {
  const probe = new ProbeBus({ cellId: "editor-shell", wallClock: () => null });
  const pump = new MessagePump(probe);
  const { clientSide, serverSide } = createTransportPair();
  pump.attach(clientSide);

  // Garbage that is not a JSON-RPC 2.0 message.
  serverSide.send({ garbage: true } as unknown as JsonRpcMessage);

  const errs = payloadsOf<{ direction: string; kind: string; detail: string }>(
    probe,
    "editor.lsp.error.protocol",
  );
  assert.equal(errs.length, 1, `expected exactly one protocol error, saw ${errs.length}`);
  assert.equal(errs[0].kind, "malformed");
  assert.equal(errs[0].direction, "in");
});

test("silent drop: an unknown server-initiated request is probed {kind:'unhandled'} and answered MethodNotFound", () => {
  const probe = new ProbeBus({ cellId: "editor-shell", wallClock: () => null });
  const pump = new MessagePump(probe);
  const { clientSide, serverSide } = createTransportPair();
  const serverGot: JsonRpcMessage[] = [];
  serverSide.onMessage((m) => serverGot.push(m));
  pump.attach(clientSide);

  serverSide.send({ jsonrpc: "2.0", id: 7, method: "custom/doThing", params: {} });

  const errs = payloadsOf<{ kind: string; method?: string }>(probe, "editor.lsp.error.protocol");
  assert.equal(errs.length, 1, `expected exactly one protocol error, saw ${JSON.stringify(errs)}`);
  assert.equal(errs[0].kind, "unhandled");
  assert.equal(errs[0].method, "custom/doThing");
  // And the wire answer (secondary to the probe): JSON-RPC MethodNotFound.
  const reply = serverGot.find((m) => m.id === 7);
  assert.ok(reply, "unknown request got no reply — the server would hang forever");
  assert.equal(reply!.error?.code, -32601);
});

test("silent drop: $/progress begin/end and window/logMessage around didOpen are probed", async () => {
  const h = await openTestCell("type-error.py", {
    serverCfg: { behaviors: behaviors({ progressOnOpen: true }) },
  });
  const bus = h.cell.probe;

  const progress = payloadsOf<{ token: unknown; kind: string; message: string | null }>(
    bus,
    "editor.lsp.in.progress",
  );
  assert.deepEqual(
    progress.map((p) => p.kind),
    ["begin", "end"],
    `progress kinds out of order or missing: ${JSON.stringify(progress)}`,
  );
  assert.equal(progress[0].token, "idx-1");

  assertFired(bus, "editor.lsp.in.logMessage");
  const logMsg = lastPayload<{ type: number; message: string }>(bus, "editor.lsp.in.logMessage");
  assert.equal(logMsg.message, "stub server: indexing");

  await h.cell.dispose();
});

test("silent drop: workspace/configuration server request is probed and answered", async () => {
  const h = await openTestCell("type-error.py", {
    serverCfg: { behaviors: behaviors({ requestConfiguration: true }) },
  });
  const bus = h.cell.probe;

  const cfg = lastPayload<{ items: { section?: string }[]; answered: unknown[] }>(
    bus,
    "editor.lsp.in.configuration",
  );
  assert.equal(cfg.items.length, 1);
  assert.equal(cfg.items[0].section, "python.analysis");
  assert.equal(cfg.answered.length, cfg.items.length, "configuration request not answered item-for-item");

  await h.cell.dispose();
});
