// ============================================================================
// P3 ai server — identity, defaults, and config shapes.
// Split out of ai/server.ts (SUB200 restructure); ai/server.ts remains the
// public facade and re-exports everything defined here. Behavior unchanged.
//
// NOTE: the server-side SECRET literals (AI_SERVER_DEFAULT_MASTER_SECRET,
// FAKE_TRANSPORT_API_KEY) stay in ai/server.ts itself — the P3 build gate
// (app/test/p3.build.gate.test.ts) live-extracts them from THAT source file.
// ============================================================================

import type { Server } from "node:http";

export const AI_SERVER_VERSION = "proofgraph-ai-server/1.0.0" as const;
export const DEFAULT_PORT = 8478;
export const DEFAULT_HUB_BASE = "http://127.0.0.1:8477";
export const DEFAULT_MODEL = "claude-sonnet-5";

export type AiTransport = "fake" | "live";

export interface AiServerConfig {
  port?: number;                 // 0 = ephemeral (tests); main() uses 8478
  hubBase?: string;              // default http://127.0.0.1:8477
  transport?: AiTransport;       // default "fake"
  /** transport used to reach the HUB (tests inject a fixture hub). */
  hubFetch?: typeof fetch;
  masterSecret?: string;         // default env AI_MASTER_SECRET or the literal in ai/server.ts
  apiKey?: string;               // live mode only; default env AI_API_KEY
  model?: string;
}

export interface AiServerHandle {
  server: Server;
  port: number;
  transport: AiTransport;
  close(): Promise<void>;
}
