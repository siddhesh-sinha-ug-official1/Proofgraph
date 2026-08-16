/**
 * P3 — the browser-side LSP transport over the hub's WS /lsp bridge.
 *
 * FAITHFUL PORT of V2's connectTransports (now vessels/v2_squiggle_env.mjs
 * after the SUB200 split; originally vessels/test_v2_squiggle.mjs,
 * credited — the pattern is reused, not reinvented), adapted only for the
 * browser runtime (no Buffer; ws.binaryType pinned to arraybuffer; the hub
 * sends one complete JSON-RPC message per WS TEXT frame, so the binary branch
 * is defensive only).
 *
 * DECLARED transport adaptation (REPORT-V2.md decision 2, unchanged): exactly
 * ONE frame — the editor's `initialize` — is enriched with
 * capabilities.workspace.configuration = true. This states a TRUE fact about
 * the composed client (the editor pump genuinely answers
 * workspace/configuration); without the advertisement pyright never sends the
 * request and gates its analysis. The enrichment is pushed to the caller's
 * enrichLog — logged, never silent.
 */

export interface BrowserMessageTransports {
  send(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): () => void;
  onClose(cb: () => void): () => void;
  close(): void;
  describe(): { kind: string; url: string };
}

export interface EnrichLogEntry {
  frame: string;
  added: string;
  why: string;
}

export function connectBrowserTransports(
  wsUrl: string,
  enrichLog: EnrichLogEntry[],
): Promise<BrowserMessageTransports> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("error", () => reject(
      new Error("ws connect failed: " + wsUrl)), { once: true });
    ws.addEventListener("open", () => {
      const msgHandlers: Array<(msg: unknown) => void> = [];
      const closeHandlers: Array<() => void> = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        const data = typeof ev.data === "string"
          ? ev.data
          : new TextDecoder("utf-8").decode(ev.data as ArrayBuffer);
        const msg = JSON.parse(data);
        for (const h of [...msgHandlers]) h(msg);
      });
      ws.addEventListener("close", () => {
        for (const h of [...closeHandlers]) h();
      });
      resolve({
        send(msg: unknown): void {
          let out = msg as Record<string, unknown>;
          const m = msg as { method?: string; params?: Record<string, unknown> & { capabilities?: Record<string, unknown> } };
          // Round WC-W6: ALWAYS enrich initialize, and ALWAYS log the branch.
          // Prior code gated on `m.params?.capabilities` being truthy — a
          // capabilities-less `initialize` (some editor pumps send `params:{}`
          // or omit capabilities entirely) crossed unenriched AND unlogged,
          // so pyright never received the workspace/configuration
          // advertisement and silently gated diagnostics with nothing in
          // enrichLog to explain why. The invariant is "exactly ONE enriched
          // frame — logged, never silent"; that pin is preserved by keeping
          // the enrichment on method==='initialize' only.
          if (m && m.method === "initialize") {
            out = structuredClone(msg) as Record<string, unknown>;
            const outAny = out as { params?: { capabilities?: Record<string, unknown> } };
            if (!outAny.params) outAny.params = {};
            const capsAbsent = !outAny.params.capabilities;
            if (capsAbsent) outAny.params.capabilities = {};
            const caps = outAny.params.capabilities as Record<string, unknown>;
            caps.workspace = {
              ...((caps.workspace as Record<string, unknown>) ?? {}),
              configuration: true,
            };
            enrichLog.push({
              frame: "initialize",
              added: capsAbsent
                ? "capabilities-absent-created; capabilities.workspace.configuration=true"
                : "capabilities.workspace.configuration=true",
              why: "composed client answers workspace/configuration (editor "
                + "pump); pyright only sends it when advertised — DECLARED "
                + "assembly adaptation (V2 decision 2), logged here, never silent"
                + (capsAbsent ? " (initialize arrived without a capabilities field; created empty then enriched)" : ""),
            });
          }
          ws.send(JSON.stringify(out));
        },
        onMessage(cb: (msg: unknown) => void): () => void {
          msgHandlers.push(cb);
          return () => { const i = msgHandlers.indexOf(cb); if (i >= 0) msgHandlers.splice(i, 1); };
        },
        onClose(cb: () => void): () => void {
          closeHandlers.push(cb);
          return () => { const i = closeHandlers.indexOf(cb); if (i >= 0) closeHandlers.splice(i, 1); };
        },
        close(): void { try { ws.close(); } catch { /* already closed */ } },
        describe(): { kind: string; url: string } { return { kind: "websocket", url: wsUrl }; },
      });
    }, { once: true });
  });
}
