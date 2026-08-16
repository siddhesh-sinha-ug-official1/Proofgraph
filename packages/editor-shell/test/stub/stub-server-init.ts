/**
 * StubLanguageServer initialize handshake (SUB200 restructure: split from
 * stub-server.ts handle(), logic verbatim): scripted failures, positionEncoding
 * negotiation modes, capability advertising, and the optional orphan response.
 */

import type { JsonRpcMessage } from "../../src/seams/capability.js";
import type { StubLanguageServer } from "./stub-server.js";

export function handleInitialize(server: StubLanguageServer, msg: JsonRpcMessage): void {
  if (server.initializeFailuresLeft > 0) {
    server.initializeFailuresLeft--;
    server.send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32002, message: "stub server: scripted initialize failure" },
    });
    return;
  }
  const requested =
    ((msg.params as { capabilities?: { general?: { positionEncodings?: string[] } } })
      ?.capabilities?.general?.positionEncodings ?? [])[0] ?? "utf-16";
  let advertised: string | undefined;
  switch (server.cfg.positionEncodingMode) {
    case "accept-utf8":
      advertised = requested === "utf-8" ? "utf-8" : "utf-16";
      break;
    case "force-utf16":
      advertised = "utf-16";
      break;
    case "omit":
      advertised = undefined;
      break;
  }
  server.encoding = advertised === "utf-8" ? "utf-8" : "utf-16";
  const capabilities: Record<string, unknown> = {
    textDocumentSync: 1, // full
    hoverProvider: server.cfg.advertise.hover,
    definitionProvider: server.cfg.advertise.definition,
    documentSymbolProvider: server.cfg.advertise.documentSymbol,
    completionProvider: server.cfg.advertise.completion ? { triggerCharacters: ["."] } : undefined,
    foldingRangeProvider: server.cfg.advertise.foldingRange,
    semanticTokensProvider: server.cfg.advertise.semanticTokens
      ? { legend: { tokenTypes: ["function"], tokenModifiers: [] }, full: true }
      : undefined,
    callHierarchyProvider: server.cfg.advertise.callHierarchy || undefined,
    typeHierarchyProvider: server.cfg.advertise.typeHierarchy || undefined,
  };
  if (advertised) capabilities.positionEncoding = advertised;
  server.respond(msg.id, {
    capabilities,
    serverInfo: { name: server.cfg.name, version: server.cfg.version },
  });
  if (server.cfg.behaviors.orphanResponseAfterInit) {
    server.send({ jsonrpc: "2.0", id: 999_999, result: { orphan: true } });
  }
}
