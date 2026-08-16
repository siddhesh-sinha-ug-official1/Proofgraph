/**
 * Editor-pane kit (SUB200 split of EditorPane.tsx — no behavior change): the
 * pane's public types, the MEASURED capability probe (tier read VERBATIM from
 * capability.wall.construct — unknown never upgrades), the capability
 * resolution (live hub LSP or the honest tier-G stub floor), the served-node
 * projection (ids VERBATIM; only span.file remaps — the declared bound) and
 * the diagnostics tap (the CELL's own pin stream, verbatim). EditorPane.tsx
 * stays the facade component with the pane's full design doc.
 */

import type { SchemaNode } from "@editor-shell/src/schema/schema.js";
import type { Capability, CapabilityFn, DepthTier } from "@editor-shell/src/seams/capability.js";
import { StubLanguageServer } from "@editor-shell/test/stub/stub-server.js";
import { createStubCapability } from "@editor-shell/test/stub/stub-capability.js";

import type { CanonicalEnvelope } from "./graphSource";
import type { EditorSideBus } from "./busAdapter";
import { connectBrowserTransports, type EnrichLogEntry } from "./lspTransport";
import { spanFileMatches } from "./uris";

export interface EditorOpenFile {
  relPath: string;     // workspace-relative
  uri: string;         // pyright-canonical
  content: string;     // the buffer to open (tab cache — may differ from disk)
  languageId: string;
}

/** Imperative surface the shell's Edit menu / save flow drives. The action ids
 *  are Monaco BUILT-INS triggered on the real editor — reuse, not reinvention. */
export interface EditorApi {
  getText(): string;
  focus(): void;
  undo(): void;
  redo(): void;
  find(): void;
  replace(): void;
}

export interface EditorPaneStatus {
  phase: "probing" | "mounting" | "ready" | "failed";
  transport: "hub-lsp-ws" | "stub-tier-G" | null;
  tier: string | null;
  detail: string;
}

export type DiagnosticsRow = {
  uri: string; version: number | null; severity: number | null;
  message: string; line: number | null; source: string | null;
};

export interface EditorPaneProps {
  hubBase: string;
  bus: EditorSideBus;
  envelope: CanonicalEnvelope;
  file: EditorOpenFile;
  fontSize: number;
  onStatus?: (status: EditorPaneStatus) => void;
  onUserEdit?: (text: string) => void;
  onEditorApi?: (api: EditorApi | null) => void;
  onDiagnostics?: (rows: DiagnosticsRow[]) => void;
}

export interface HubCapabilityProbe {
  available: boolean;
  tier: DepthTier | null;
  lspUrl: string | null;
  reason: string;
}

/** MEASURED tier or nothing: read the hub's aggregated capability stream. */
export async function probeHubCapability(hubBase: string): Promise<HubCapabilityProbe> {
  try {
    const health = await (await fetch(`${hubBase}/health`)).json();
    const lspUrl: string | null = health?.lsp?.url ?? null;
    const pins = await (await fetch(`${hubBase}/pins/history?limit=100000`)).json();
    const cap = pins?.cells?.["capability-layer"];
    if (!cap?.available) {
      return {
        available: false, tier: null, lspUrl,
        reason: String(cap?.reason ?? "capability-layer stream not attached on the hub (run: python hub/serve_app.py --lsp live)"),
      };
    }
    const constructs = (cap.events as Array<{ probeId: string; payload: { tier?: string } }>)
      .filter((e) => e.probeId === "capability.wall.construct");
    const tier = constructs.at(-1)?.payload?.tier ?? null;
    if (typeof tier !== "string" || tier.length === 0) {
      return {
        available: false, tier: null, lspUrl,
        reason: "capability stream attached but no capability.wall.construct pin — tier unproven, treated as absent (unknown never upgrades)",
      };
    }
    return { available: true, tier: tier as DepthTier, lspUrl, reason: "measured tier read verbatim from capability.wall.construct" };
  } catch (e) {
    return {
      available: false, tier: null, lspUrl: null,
      reason: `hub pins unreachable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Project the served envelope's nodes for the open file onto the editor's
 *  uri space. IDS VERBATIM; only span.file changes (the declared bound). */
export function editorNodesFor(envelope: CanonicalEnvelope, uri: string, relPath: string): SchemaNode[] {
  return envelope.nodes
    .filter((n) => {
      const f = String((n as { span?: { file?: string } }).span?.file ?? "");
      return f !== "" && spanFileMatches(f, relPath);
    })
    .map((n) => ({
      ...(n as unknown as SchemaNode),
      span: { ...(n as unknown as SchemaNode).span, file: uri },
    }));
}

/** Live hub LSP when the probe measured a tier + served a socket url;
 *  otherwise the honest floor: stub transport, tier G — no live diagnostics
 *  claimed. Exactly the branch EditorPane's mount ran inline before.
 *
 *  D-dedup U9 (round-2026-08-16): languageId is now derived from the open
 *  file (via languageIdFor at the call site) and passed in, rather than the
 *  literal "python" both branches hardcoded — the hardcode silently mislabels
 *  every non-python buffer (e.g. .lean under the CT dock). */
export function resolveEditorCapability(
  probe: HubCapabilityProbe, enrichLog: EnrichLogEntry[], languageId: string,
): { capability: CapabilityFn; transport: "hub-lsp-ws" | "stub-tier-G"; tier: string } {
  if (probe.available && probe.lspUrl) {
    const lspUrl = probe.lspUrl;
    const cap: Capability = {
      tier: probe.tier as DepthTier,
      handle: {
        kind: "websocket",
        languageId,
        connect: async () => {
          const t = await connectBrowserTransports(lspUrl, enrichLog);
          return t as unknown as Awaited<ReturnType<Capability["handle"]["connect"]>>;
        },
      },
    };
    return { capability: () => cap, transport: "hub-lsp-ws", tier: probe.tier as string };
  }
  // honest floor: stub transport, tier G — no live diagnostics claimed.
  return {
    capability: createStubCapability({
      tier: "G",
      server: new StubLanguageServer(), // empty meta: serves NO diagnostics
      languageId,
    }).capability,
    transport: "stub-tier-G",
    tier: "G",
  };
}

/** The mounting-phase status detail — verbatim the strings the pane showed inline. */
export function mountingDetail(
  transport: "hub-lsp-ws" | "stub-tier-G", probe: HubCapabilityProbe, tier: string,
): string {
  return transport === "hub-lsp-ws"
    ? `live LSP over ${probe.lspUrl} at MEASURED tier ${tier} (${probe.reason})`
    : `stub transport, tier G (grammar floor): ${probe.reason}`;
}

/** The ready-phase status detail — verbatim the strings the pane showed inline. */
export function readyDetail(
  transport: "hub-lsp-ws" | "stub-tier-G", enrichCount: number, nodesIndexed: number,
): string {
  return transport === "hub-lsp-ws"
    ? `editor wall standing; diagnostics live (initialize enrichments: ${enrichCount}); nodes indexed: ${nodesIndexed} (span-file remap bound: extractor-relative → open-file uri, ids untouched)`
    : `editor wall standing on the stub floor; nodes indexed: ${nodesIndexed}; no live diagnostics are claimed at tier G`;
}

/** Diagnostics tap handler over the cell's editor.lsp.in.diagnostics pin. */
export function makeDiagnosticsTap(onDiagnostics?: (rows: DiagnosticsRow[]) => void): (ev: { payload: unknown }) => void {
  const seen: DiagnosticsRow[] = [];
  return (ev) => {
    const p = ev.payload as {
      uri?: string; version?: number;
      diagnostics?: Array<{ range?: { start?: { line?: number } }; severity?: number; message?: string; source?: string }>;
    };
    seen.splice(0);
    for (const d of p.diagnostics ?? []) {
      seen.push({
        uri: String(p.uri ?? ""),
        version: typeof p.version === "number" ? p.version : null,
        severity: typeof d.severity === "number" ? d.severity : null,
        message: String(d.message ?? ""),
        line: typeof d.range?.start?.line === "number" ? d.range.start.line + 1 : null,
        source: typeof d.source === "string" ? d.source : null,
      });
    }
    onDiagnostics?.([...seen]);
  };
}
