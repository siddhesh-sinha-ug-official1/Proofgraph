/**
 * Round WC-W6: initialize enrichment used to gate on `params.capabilities`
 * being truthy — an editor pump that sent `params:{}` (or omitted capabilities
 * entirely) crossed the wire unenriched AND unlogged. Pyright then silently
 * gated diagnostics with nothing in enrichLog to explain why.
 *
 * These tests spin up a minimal in-process WebSocket server (the `ws`
 * package — already vendored via the app node_modules), then drive
 * connectBrowserTransports.send() with each shape of `initialize` and assert:
 *   (1) the wire ALWAYS carries workspace.configuration=true;
 *   (2) enrichLog ALWAYS has an entry (never silent);
 *   (3) the enrichment fires only for method==='initialize' (the "exactly ONE
 *       enriched frame" invariant carried in the module doc).
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — no @types/ws in this app; ws is a jsdom-adjacent dep
// vendored via node_modules and only used inside this test file.
import { WebSocketServer } from "ws";
import { AddressInfo } from "node:net";
import { connectBrowserTransports, type EnrichLogEntry } from "../src/lspTransport";

let wss: any;
let wsUrl: string;
const received: string[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    wss = new WebSocketServer({ port: 0 }, () => resolve());
  });
  const addr = wss.address() as AddressInfo;
  wsUrl = `ws://127.0.0.1:${addr.port}`;
  wss.on("connection", (sock: any) => {
    sock.on("message", (data: any) => { received.push(data.toString()); });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => wss.close(() => resolve()));
});

async function drive(sendMsg: unknown): Promise<{ wire: any; enrichLog: EnrichLogEntry[] }> {
  received.length = 0;
  const enrichLog: EnrichLogEntry[] = [];
  const t = await connectBrowserTransports(wsUrl, enrichLog);
  t.send(sendMsg);
  // small wait for the message to reach the server
  await new Promise((r) => setTimeout(r, 40));
  t.close();
  await new Promise((r) => setTimeout(r, 20));
  return { wire: received.length > 0 ? JSON.parse(received[0]) : null, enrichLog };
}

describe("Round WC-W6: initialize enrichment always fires, always logs", () => {
  test("initialize with a populated capabilities object: workspace.configuration=true is added (original behavior preserved)", async () => {
    const { wire, enrichLog } = await drive({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { processId: null, capabilities: { textDocument: { hover: {} } } },
    });
    expect(wire.params.capabilities.workspace.configuration).toBe(true);
    expect(wire.params.capabilities.textDocument.hover).toEqual({});
    expect(enrichLog).toHaveLength(1);
    expect(enrichLog[0].frame).toBe("initialize");
    expect(enrichLog[0].added).toContain("capabilities.workspace.configuration=true");
  });

  test("initialize with params:{} (capabilities ABSENT): enrichment now fires AND logs a capabilities-absent branch", async () => {
    const { wire, enrichLog } = await drive({
      jsonrpc: "2.0", id: 1, method: "initialize", params: {},
    });
    // wire: an enriched capabilities object was created from nothing
    expect(wire.params.capabilities.workspace.configuration).toBe(true);
    // log: a single entry, mentions the capabilities-absent branch by name
    expect(enrichLog).toHaveLength(1);
    expect(enrichLog[0].added).toMatch(/capabilities-absent/);
  });

  test("initialize with NO params at all: enrichment still fires and still logs", async () => {
    const { wire, enrichLog } = await drive({
      jsonrpc: "2.0", id: 1, method: "initialize",
    });
    expect(wire.params.capabilities.workspace.configuration).toBe(true);
    expect(enrichLog).toHaveLength(1);
    expect(enrichLog[0].added).toMatch(/capabilities-absent/);
  });

  test("a non-initialize frame is passed through unmodified and NOT logged (single-frame invariant preserved)", async () => {
    const { wire, enrichLog } = await drive({
      jsonrpc: "2.0", id: 2, method: "textDocument/didOpen",
      params: { textDocument: { uri: "file:///a.py", languageId: "python", version: 1, text: "" } },
    });
    // No enrichment for non-initialize methods.
    expect(wire.params.textDocument.uri).toBe("file:///a.py");
    expect(wire.params.capabilities).toBeUndefined();
    expect(enrichLog).toHaveLength(0);
  });
});
