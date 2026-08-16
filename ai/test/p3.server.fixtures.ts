// ============================================================================
// P3 ai/server.ts connector tests — shared fixtures + helpers (SUB200
// restructure: split out of the former test/p3.server.test.ts; the tests now
// live in p3.server.ask.test.ts / p3.server.custody.test.ts — same 6 tests,
// same assertions).
//
// The seam: browser-shaped HTTP client -> ai server (:ephemeral) -> V6 outlet
// -> byok wall (FAKE transport) + a FIXTURE HUB (node:http) standing in for
// hub :8477.
// ============================================================================

import http from "node:http";

// ---- test secrets (never allowed to serialize into any response) -----------
export const TEST_MASTER_SECRET = "p3-server-test-master-secret-strong-5566";

// ---- fixture graph (canonical envelope shapes, V6-style) --------------------
export const MOD_ID = "n_b0b0b0b0b0b0b0b0";
export const MAIN_ID = "n_1212121212121212";
export const USED_ID = "n_2323232323232323";
export const UNUSED_ID = "n_3434343434343434";
export const LEAD_ID = "e_5656565656565656";

function mkNode(id: string, kind: "module" | "function", name: string, byteStart: number) {
  return {
    id, kind, lang: "python", name,
    signature: kind === "function" ? `def ${name}()` : null,
    span: { file: "moatpkg/core.py", byteStart, byteEnd: byteStart + 40 },
    fill: { status: "unknown", source: "" },
    outline: null,
    origin: "checked",
    provenance: { tier: "T1", extractor: "structure-extractor@p3-fixture", resolved: true },
  };
}

export function makeEnvelope(unusedName = "helper_unused") {
  return {
    schemaVersion: "v0",
    nodes: [
      mkNode(MOD_ID, "module", "moatpkg.core", 0),
      mkNode(MAIN_ID, "function", "main", 100),
      mkNode(USED_ID, "function", "helper_used", 200),
      mkNode(UNUSED_ID, "function", unusedName, 300),
    ],
    edges: [{
      id: "e_4545454545454545", kind: "calls", srcId: MAIN_ID, dstId: USED_ID,
      resolved: true, resolver: "pyright",
      provenance: { tier: "T2", extractor: "structure-extractor@p3-fixture" },
    }],
    leads: [{
      id: LEAD_ID, kind: "calls", srcId: USED_ID, dstId: "unresolved:mystery",
      resolved: false, resolver: "",
      provenance: { tier: "T1", extractor: "structure-extractor@p3-fixture" },
    }],
  };
}

// ---- the fixture hub ---------------------------------------------------------
export interface FixtureHub {
  base: string;
  close(): Promise<void>;
  setEnvelope(env: unknown): void;
  setQueryRefusal(refusal: { status: number; failureClass: string } | null): void;
}

export function startFixtureHub(): Promise<FixtureHub> {
  let envelope: unknown = makeEnvelope();
  let queryRefusal: { status: number; failureClass: string } | null = null;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const json = (status: number, obj: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (url.pathname === "/graph") {
      json(200, envelope);
    } else if (url.pathname === "/query") {
      if (queryRefusal) {
        json(queryRefusal.status, { failureClass: queryRefusal.failureClass, detail: "fixture refusal" });
      } else {
        json(200, {
          roots: [MAIN_ID],
          unused: [UNUSED_ID],
          crosscheck: { library: "networkx", agrees: true, symmetricDiff: [] },
        });
      }
    } else {
      json(404, { failureClass: "unknown-endpoint", detail: url.pathname });
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        setEnvelope: (e) => { envelope = e; },
        setQueryRefusal: (r) => { queryRefusal = r; },
      });
    });
  });
}

export async function post(port: number, path: string, body: unknown): Promise<{ status: number; text: string; json: any }> {
  const resp = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* refusal shape asserted by caller */ }
  return { status: resp.status, text, json };
}
