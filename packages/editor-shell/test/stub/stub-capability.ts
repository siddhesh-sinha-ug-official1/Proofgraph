/**
 * Tree 2 stand-in: `capability(lang) → { tier, handle }` whose handle connects
 * to an in-process StubLanguageServer over the in-memory transport pair.
 * The cell never sees the difference — the seam type is §7.7(a) exactly.
 */

import type { Capability, CapabilityFn, LspHandle, MessageTransports } from "../../src/seams/capability.js";
import type { DepthTier } from "../../src/seams/capability.js";
import { createTransportPair } from "./stub-transport.js";
import { StubLanguageServer } from "./stub-server.js";

export interface StubCapabilityOptions {
  tier: DepthTier;
  server: StubLanguageServer;
  /** Reject the first N connect() calls (reconnect/backoff tests). */
  failConnectTimes?: number;
  languageId?: string;
}

export interface StubCapabilityHandleInfo {
  connectCalls: number;
}

export function createStubCapability(opts: StubCapabilityOptions): {
  capability: CapabilityFn;
  info: StubCapabilityHandleInfo;
} {
  const info: StubCapabilityHandleInfo = { connectCalls: 0 };
  let failsLeft = opts.failConnectTimes ?? 0;

  const handle: LspHandle = {
    kind: "inmemory",
    languageId: opts.languageId ?? "python",
    async connect(): Promise<MessageTransports> {
      info.connectCalls++;
      if (failsLeft > 0) {
        failsLeft--;
        throw new Error("stub capability: scripted connect failure");
      }
      const { clientSide, serverSide } = createTransportPair({ url: "inmemory://stub-server" });
      opts.server.attach(serverSide);
      return clientSide;
    },
  };

  const cap: Capability = { tier: opts.tier, handle };
  return { capability: () => cap, info };
}
