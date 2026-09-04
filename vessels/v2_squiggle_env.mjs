/**
 * vessels/v2_squiggle_env.mjs — shared environment for the V2 connector
 * suite: demo-file fixture (canonical pyright uri + expected byte span),
 * schema nodes, editor-shell dist imports, the WS transport factory (with
 * the DECLARED initialize enrichment), helpers, and the spawned-hub
 * lifecycle hooks (before/after) writing into the shared `ctx`.
 *
 * SUB200 restructure: split out of vessels/test_v2_squiggle.mjs (which stays
 * the `node --test` entry point).  Behavior unchanged.
 */
import { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Runner } from "./v2_runner_protocol.mjs";

export const VESSELS = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(VESSELS);
const ES_DIST = path.join(ROOT, "packages", "editor-shell", "dist");
const DEMO = path.join(VESSELS, "fixtures_v2", "v2_demo.py");

export const { createEditorWall } = await import(
  pathToFileURL(path.join(ES_DIST, "src", "wall.js")));
export const { LocalSelectionBus } = await import(
  pathToFileURL(path.join(ES_DIST, "src", "seams", "bus.js")));
export const { StubEditorAdapter } = await import(
  pathToFileURL(path.join(ES_DIST, "test", "stub", "stub-adapter.js")));

// ── demo file → canonical pyright uri + expected byte span ─────────────────
export const demoBytes = readFileSync(DEMO);
const demoText = demoBytes.toString("utf-8");
assert.equal(Buffer.byteLength(demoText, "utf-8"), demoText.length,
  "demo file must stay ASCII so byte offsets == char offsets");
// pyright canonical form: forward slashes, LOWERCASE drive, %3A colon
// (spike-verified byte-exact round-trip; editor uri guard needs equality).
let p = DEMO.replace(/\\/g, "/");
p = p[0].toLowerCase() + p.slice(1);
export const URI = "file:///" + p.replace(":", "%3A");

const ERR_EXPR = '"str" + 1';
export const expectedByteStart = demoText.indexOf(ERR_EXPR);
export const expectedByteEnd = expectedByteStart + ERR_EXPR.length;
assert.ok(expectedByteStart > 0, "demo file carries the type error");

const mintId = (name) =>
  "n_" + createHash("sha256").update("v2:" + name).digest("hex").slice(0, 16);
const shoutStart = demoText.indexOf("def shout");
const brokenStart = demoText.indexOf("def broken");
export const NODES = [
  {
    id: mintId("shout"), kind: "function", lang: "python", name: "shout",
    signature: null,
    span: { file: URI, byteStart: shoutStart, byteEnd: brokenStart },
    fill: { status: "unknown", source: "" }, outline: null,
    origin: "checked",
    provenance: { tier: "T3", extractor: "v2-vessel-fixture", resolved: true },
  },
  {
    id: mintId("broken"), kind: "function", lang: "python", name: "broken",
    signature: null,
    span: { file: URI, byteStart: brokenStart, byteEnd: demoText.length },
    fill: { status: "unknown", source: "" }, outline: null,
    origin: "checked",
    provenance: { tier: "T3", extractor: "v2-vessel-fixture", resolved: true },
  },
];
export const BROKEN_ID = NODES[1].id;
export const SHOUT_ID = NODES[0].id;

// ── helpers ─────────────────────────────────────────────────────────────────
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function until(fn, timeoutMs, what, everyMs = 250) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting: ${what}`);
    await sleep(everyMs);
  }
}

export function nodePids() {
  if (process.platform === "win32") {
    const out = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH')
      .toString();
    return new Set(out.split(/\r?\n/).filter((l) => l.includes("node.exe"))
      .map((l) => Number(l.split('","')[1])));
  }
  // POSIX: use pgrep to find node processes.
  try {
    const out = execSync("pgrep -x node", { encoding: "utf-8" });
    return new Set(out.trim().split(/\n/).filter(Boolean).map(Number));
  } catch {
    return new Set();   // pgrep exits 1 when no matches
  }
}

export const evts = (wall, id) =>
  wall.pins.history().filter((e) => e.probeId === id);

/** Editor-side MessageTransports over Node 24's built-in WebSocket. */
export function connectTransports(wsUrl, enrichLog) {
  return new Promise((resolve, reject) => {
    const ws = new globalThis.WebSocket(wsUrl);
    ws.addEventListener("error", () => reject(
      new Error("ws connect failed: " + wsUrl)), { once: true });
    ws.addEventListener("open", () => {
      const msgHandlers = [];
      const closeHandlers = [];
      ws.addEventListener("message", (ev) => {
        const data = typeof ev.data === "string" ? ev.data
          : Buffer.from(ev.data).toString("utf-8");
        const msg = JSON.parse(data);
        for (const h of [...msgHandlers]) h(msg);
      });
      ws.addEventListener("close", () => {
        for (const h of [...closeHandlers]) h();
      });
      resolve({
        send(msg) {
          let out = msg;
          if (msg && msg.method === "initialize" && msg.params?.capabilities) {
            out = structuredClone(msg);
            out.params.capabilities.workspace = {
              ...(out.params.capabilities.workspace ?? {}),
              configuration: true,
            };
            enrichLog.push({
              frame: "initialize",
              added: "capabilities.workspace.configuration=true",
              why: "composed client answers workspace/configuration (editor "
                + "pump); pyright only sends it when advertised — DECLARED "
                + "assembly adaptation, logged here, never silent",
            });
          }
          ws.send(JSON.stringify(out));
        },
        onMessage(cb) {
          msgHandlers.push(cb);
          return () => { const i = msgHandlers.indexOf(cb); if (i >= 0) msgHandlers.splice(i, 1); };
        },
        onClose(cb) {
          closeHandlers.push(cb);
          return () => { const i = closeHandlers.indexOf(cb); if (i >= 0) closeHandlers.splice(i, 1); };
        },
        close() { try { ws.close(); } catch { /* already closed */ } },
        describe() { return { kind: "websocket", url: wsUrl }; },
      });
    }, { once: true });
  });
}

// ── the spawned hub (shared mutable ctx: runner / ready / baseline) ─────────
export const ctx = { runner: null, ready: null, baselineNodePids: null };

before(async () => {
  ctx.baselineNodePids = nodePids();
  const proc = spawn("python", [path.join(VESSELS, "v2_hub_runner.py")],
    { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  ctx.runner = new Runner(proc);
  ctx.ready = await ctx.runner.next(360000, "ready line (capability battery)");
  assert.equal(ctx.ready.ready, true,
    `runner not ready: ${JSON.stringify(ctx.ready)}`);
}, { timeout: 400000 });

after(async () => {
  if (ctx.runner && ctx.runner.proc.exitCode === null) ctx.runner.proc.kill();
});
