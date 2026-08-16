/**
 * Full behaviors object for stub-server configs (the config type is not
 * deep-partial) — SUB200 restructure: split from 08-lsp-messages.test.ts,
 * verbatim.
 */

import type { StubServerConfig } from "../stub/stub-server.js";

export function behaviors(over: Partial<StubServerConfig["behaviors"]>): StubServerConfig["behaviors"] {
  return {
    staleOnNextChange: false,
    orphanResponseAfterInit: false,
    progressOnOpen: false,
    requestConfiguration: false,
    failInitializeTimes: 0,
    ...over,
  };
}
