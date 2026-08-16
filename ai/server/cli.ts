// ============================================================================
// P3 ai server — the CLI (`node ai/server.ts [--live] [--port N] [--hub URL]`).
// Split out of ai/server.ts (SUB200 restructure). Behavior unchanged.
//
// The facade calls maybeRunCli(import.meta.url) at the end of its body, so the
// direct-run detection still compares the FACADE's module url against
// process.argv[1] — `node ai/server.ts` behaves exactly as before, and a mere
// import of the facade never starts a server.
// ============================================================================

import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import { AI_SERVER_DEFAULT_MASTER_SECRET } from "../server.ts";
import { AI_SERVER_VERSION, DEFAULT_HUB_BASE, DEFAULT_PORT } from "./config.ts";
import { OutletHttpRefusal } from "./hub.ts";
import { createAiServer } from "./core.ts";

export function maybeRunCli(entryModuleUrl: string): void {
  const isMain = (() => {
    try {
      return process.argv[1] !== undefined
        && entryModuleUrl === pathToFileURL(process.argv[1]).href;
    } catch { return false; }
  })();
  if (!isMain) return;

  const live = process.argv.includes("--live");
  const portArg = process.argv.indexOf("--port");
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : DEFAULT_PORT;
  // Green-flow round (additive CLI seam, mirrors the app's ?hub= override):
  // --hub http://127.0.0.1:PORT points this outlet at an EPHEMERAL hub so the
  // acceptance browser step never reads the live stack's fixed-port hub.
  const hubArg = process.argv.indexOf("--hub");
  const hubBase = hubArg >= 0 ? process.argv[hubArg + 1] : undefined;
  createAiServer({
    port,
    hubBase,
    transport: live ? "live" : "fake",
    // a per-process random masterSecret unless one is injected — the vault
    // never needs a portable secret in FAKE mode.
    masterSecret: process.env.AI_MASTER_SECRET
      ?? (live ? undefined : `${AI_SERVER_DEFAULT_MASTER_SECRET}-${randomBytes(8).toString("hex")}`),
  }).then((h) => {
    console.log(JSON.stringify({
      ready: true, version: AI_SERVER_VERSION, port: h.port,
      transport: h.transport, hub: hubBase ?? DEFAULT_HUB_BASE,
      note: h.transport === "fake"
        ? "FAKE transport: deterministic stand-in model; tool execution + node ids are REAL hub graph data; no network, no real keys"
        : "LIVE transport: AI_API_KEY from this process env only",
    }));
  }).catch((e) => {
    console.error(JSON.stringify({
      ready: false,
      failureClass: e instanceof OutletHttpRefusal ? e.failureClass : "ai-internal",
      detail: e instanceof Error ? e.message : String(e),
    }));
    process.exit(2);
  });
}
