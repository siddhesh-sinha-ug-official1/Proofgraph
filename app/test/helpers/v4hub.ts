/**
 * SUB200 restructure (wave 2) — shared process lifecycle + transport for the
 * v4.serve.* seam suites, hoisted VERBATIM from v4.serve.test.tsx.
 *
 * Each split test file stands its OWN real python hub (vessels/serve_hub_v4.py
 * on ephemeral ports — the launcher's ports are OS-granted, so parallel test
 * files never collide) via setupV4Hub(), which registers the original
 * beforeAll/afterAll pair: spawn → info line → /health → healthy-path
 * fetchGraphVerified + view-wall mount, and the no-orphaned-python teardown.
 */

import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, expect } from "vitest";

import { fetchGraphVerified, type FetchedEnvelope, type HttpGet } from "../../src/graphSource";
import { createGraphViewWall, type GraphViewWall } from "@graph-view/src/wall";
import { localBus, type LocalBus } from "./v4pins";

// ── transport: deterministic node:http (jsdom provides no fetch) ─────────────
export const httpGet: HttpGet = (url) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, bytes: new Uint8Array(Buffer.concat(chunks)) }));
    });
    req.on("error", reject);
  });

export const getJson = async (url: string): Promise<{ status: number; body: any }> => {
  const { status, bytes } = await httpGet(url);
  return { status, body: JSON.parse(new TextDecoder("utf-8").decode(bytes)) };
};

// ── process lifecycle ─────────────────────────────────────────────────────────
const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const SERVE_SCRIPT = p("../../../vessels/serve_hub_v4.py");
export const TRACE_OUT = p("../../../vessels/TRACE-node.json");
const PYTHON = process.env.PYTHON ?? "python";

export interface HubInfo {
  httpPort: number; wsPort: number; nodes: number; edges: number; leads: number;
  declaredRoots: string[]; entryName: string;
}

/** Shared per-file context, populated by setupV4Hub()'s beforeAll. */
export interface V4Ctx {
  BASE: string;
  INFO: HubInfo;
  served: FetchedEnvelope;
  truth: FetchedEnvelope;
  viewWall: GraphViewWall;
  viewBus: LocalBus;
  disposables: GraphViewWall[];
}

function readInfoLine(child: ChildProcess, stderr: () => string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(
      () => reject(new Error(`hub launcher printed no info line in ${timeoutMs}ms; stderr:\n${stderr()}`)),
      timeoutMs);
    child.stdout!.setEncoding("utf8");
    const onData = (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        clearTimeout(timer);
        child.stdout!.off("data", onData);
        resolve(buf.slice(0, nl));
      }
    };
    child.stdout!.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`hub launcher exited early (code ${code}); stderr:\n${stderr()}`));
    });
  });
}

async function waitHealth(base: string, stderr: () => string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const { status, body } = await getJson(`${base}/health`);
      if (status === 200 && body.ok === true) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`hub /health never became ok; stderr:\n${stderr()}`);
}

/** Registers the original beforeAll/afterAll; returns the (mutable) context. */
export function setupV4Hub(): V4Ctx {
  let hub: ChildProcess | null = null;
  let stderrBuf = "";
  const ctx = { disposables: [] as GraphViewWall[] } as V4Ctx;

  beforeAll(async () => {
    hub = spawn(PYTHON, [SERVE_SCRIPT], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    hub.stderr!.setEncoding("utf8");
    hub.stderr!.on("data", (c: string) => { stderrBuf += c; });
    ctx.INFO = JSON.parse(await readInfoLine(hub, () => stderrBuf, 120000));
    ctx.BASE = `http://127.0.0.1:${ctx.INFO.httpPort}`;
    await waitHealth(ctx.BASE, () => stderrBuf);

    // Healthy-path fetch + verify + mount, shared read-only by the tests.
    const verified = await fetchGraphVerified(ctx.BASE, httpGet);
    ctx.served = verified.served;
    ctx.truth = verified.truth;
    ctx.viewBus = localBus();
    ctx.viewWall = await createGraphViewWall(ctx.served.envelope, ctx.viewBus);
    ctx.disposables.push(ctx.viewWall);
  }, 180000);

  afterAll(async () => {
    for (const w of ctx.disposables.splice(0)) {
      try { w.cell.controller.dispose(); } catch { /* already torn down */ }
    }
    if (hub === null) return;
    const child = hub;
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
    child.stdin!.end(); // the launcher's stdin.read() returns EOF → server.stop() → exit 0
    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(true), 15000)),
    ]);
    if (timedOut) {
      child.kill();
      throw new Error(
        "orphaned-subprocess-tree guard: the hub python did not exit on stdin close " +
        "within 15s — hard-killed, and the suite fails loudly rather than orphan it");
    }
    expect(child.exitCode, "hub python must exit cleanly (no orphaned python)").toBe(0);
  }, 30000);

  return ctx;
}
