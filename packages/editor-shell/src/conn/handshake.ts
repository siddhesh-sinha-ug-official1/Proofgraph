/**
 * S2 initialize handshake + probe-safe transport description (SUB200
 * restructure: split from Connector.runHandshake, logic and probes verbatim).
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { Capability } from "../seams/capability.js";
import type { MessagePump } from "../lsp/pump.js";
import type { PositionEncoding } from "../map/span-index.js";
import type { ConnState, ConnectorOptions, ServerCapabilitySummary } from "./conn-types.js";

export async function runHandshake(
  probe: ProbeBus,
  pump: MessagePump,
  state: ConnState,
  opts: ConnectorOptions,
  openRef: string,
): Promise<void> {
  // ── initialize handshake ──────────────────────────────────────────────
  const initializeParams = {
    processId: null,
    clientInfo: { name: state.clientName, version: "0.0.1" },
    rootUri: null,
    capabilities: {
      general: { positionEncodings: [opts.requestedPositionEncoding] },
      textDocument: {
        synchronization: { didSave: false },
        publishDiagnostics: { relatedInformation: true, tagSupport: { valueSet: [1, 2] } },
        hover: {},
        definition: {},
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      },
    },
  };
  const initProbe = probe.emit(
    "editor.conn.client.init",
    { clientName: state.clientName, initializeParams },
    openRef,
  );
  const initRef = probe.ref(initProbe);

  let initMsg;
  try {
    initMsg = await pump.request("initialize", initializeParams, initRef);
  } catch (err) {
    probe.emit(
      "editor.conn.handshake.fail",
      { phase: "initialize", message: String(err) },
      initRef,
    );
    throw err;
  }
  if (initMsg.error) {
    state.phase = "error";
    probe.emit(
      "editor.conn.handshake.fail",
      { phase: "initialize", message: initMsg.error.message },
      initRef,
    );
    throw new Error(`initialize failed: ${initMsg.error.message}`);
  }

  const result = initMsg.result as {
    capabilities?: Record<string, unknown> & { positionEncoding?: string };
    serverInfo?: { name?: string; version?: string };
  };
  const caps = result?.capabilities ?? {};

  // positionEncoding negotiation — LSP 3.17: absent means utf-16.
  const accepted = (caps.positionEncoding as PositionEncoding | undefined) ?? "utf-16";
  state.positionEncoding = accepted;
  probe.emit(
    "editor.conn.positionEncoding.negotiate",
    {
      requested: opts.requestedPositionEncoding,
      accepted,
      winner: accepted,
      reason:
        accepted === opts.requestedPositionEncoding
          ? "server accepted our requested encoding"
          : `server ${caps.positionEncoding ? "forced" : "omitted positionEncoding (LSP default)"} ${accepted}; S7/S4 must convert accordingly`,
    },
    initRef,
  );

  const summary: ServerCapabilitySummary = {
    hoverProvider: !!caps.hoverProvider,
    definitionProvider: !!caps.definitionProvider,
    documentSymbolProvider: !!caps.documentSymbolProvider,
    callHierarchyProvider: !!caps.callHierarchyProvider,
    typeHierarchyProvider: !!caps.typeHierarchyProvider,
    semanticTokensProvider: !!caps.semanticTokensProvider,
    completionProvider: !!caps.completionProvider,
    foldingRangeProvider: !!caps.foldingRangeProvider,
  };
  state.serverCapabilities = summary;
  probe.emit("editor.conn.capabilities.server", { ...summary }, initRef);

  // OPTIONAL LSP capabilities — never assumed present; absence is a logged
  // degrade, telling the reader the SERVER lacks the feature, not the editor.
  const optionalMissing = (
    ["callHierarchyProvider", "typeHierarchyProvider", "semanticTokensProvider"] as const
  ).filter((k) => !summary[k]);
  if (optionalMissing.length > 0) {
    probe.emit(
      "editor.conn.capability.missing",
      {
        missing: optionalMissing,
        degradeTo: "feature hidden in UI; request suppressed at the pump",
        reason: "optional LSP capability not advertised by server",
      },
      initRef,
    );
  }

  state.serverInfo = {
    name: result?.serverInfo?.name ?? "(unnamed server)",
    version: result?.serverInfo?.version ?? "(unversioned)",
  };
  probe.emit("editor.conn.serverInfo", { ...state.serverInfo }, initRef);

  pump.notify("initialized", {}, initRef);
}

/**
 * Connect-time probes (SUB200 restructure: split from Connector.connect,
 * verbatim): the capability input + the upstream half of the green-honesty
 * guard, recorded BEFORE any verdict is painted so downstream green decisions
 * have a cause to point at. Returns the capability probe's causal ref.
 */
export function emitConnectProbes(
  probe: ProbeBus,
  cap: Capability,
  lang: string,
  causeId: string | null,
): string {
  const capProbe = probe.emit(
    "editor.conn.capability.input",
    {
      lang,
      tier: cap.tier,
      handleKind: cap.handle.kind,
      handleRef: cap.handle.languageId,
    },
    causeId,
  );
  const capRef = probe.ref(capProbe);

  probe.emit(
    "editor.conn.tier.guard",
    {
      tier: cap.tier,
      liveGreenAllowed: cap.tier === "CT",
      reason:
        cap.tier === "CT"
          ? "tier CT = compiler truth; live verdicts from this server may back green"
          : `tier ${cap.tier} is not compiler truth; green from this server is forbidden (green may never be faked)`,
    },
    capRef,
  );
  return capRef;
}

/** Strip query strings from probed URLs — that's where bearer tokens live. */
export function scrubUrl(url: string | undefined): string | null {
  if (!url) return null;
  const q = url.indexOf("?");
  return q === -1 ? url : `${url.slice(0, q)}?…redacted…`;
}

export function describeSafely(cap: Capability): { url?: string; secret?: string } {
  // handle.connect() yields transports later; before that we only know the kind.
  // Stub/websocket handles may expose a describe on the handle itself.
  const h = cap.handle as { describe?: () => { url?: string; secret?: string } };
  return h.describe ? h.describe() : {};
}
