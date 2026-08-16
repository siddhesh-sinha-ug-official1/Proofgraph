/**
 * §7(g) transports — the spawned hub runner (V2's, verbatim reuse) and
 * V2's editor-side MessageTransports over the built-in WebSocket.
 * Carved VERBATIM from squiggle_check.mjs (SUB200 restructure, wave 2).
 */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function until(fn, timeoutMs, what, everyMs = 250) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting: ${what}`);
    await sleep(everyMs);
  }
}

// ── the spawned hub runner (V2's, verbatim reuse) ───────────────────────────
export class Runner {
  constructor(proc) {
    this.proc = proc;
    this.lines = [];
    this.waiters = [];
    this.exited = new Promise((res) => proc.on("exit", (c) => res(c)));
    this.stderr = "";
    proc.stderr.on("data", (d) => { this.stderr += d.toString(); });
    let buf = "";
    proc.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("{")) continue;
        const obj = JSON.parse(line);
        const w = this.waiters.shift();
        if (w) w(obj); else this.lines.push(obj);
      }
    });
  }
  next(timeoutMs, what) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(
        `runner timeout (${what}); stderr tail: ${this.stderr.slice(-2000)}`)), timeoutMs);
      this.waiters.push((o) => { clearTimeout(t); res(o); });
    });
  }
  async cmd(line, timeoutMs = 30000) {
    this.proc.stdin.write(line + "\n");
    const res = await this.next(timeoutMs, line);
    if (res.error) throw new Error(`runner ${line} → ${res.error}`);
    return res;
  }
}

/** V2's editor-side MessageTransports over the built-in WebSocket, VERBATIM
 *  (incl. the single declared initialize enrichment — logged + counted). */
export function connectTransports(wsUrl, enrichLog) {
  return new Promise((resolve, reject) => {
    const ws = new globalThis.WebSocket(wsUrl);
    ws.addEventListener("error", () => reject(new Error("ws connect failed: " + wsUrl)), { once: true });
    ws.addEventListener("open", () => {
      const msgHandlers = [];
      const closeHandlers = [];
      ws.addEventListener("message", (ev) => {
        const data = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf-8");
        const msg = JSON.parse(data);
        for (const h of [...msgHandlers]) h(msg);
      });
      ws.addEventListener("close", () => { for (const h of [...closeHandlers]) h(); });
      resolve({
        send(msg) {
          let out = msg;
          if (msg && msg.method === "initialize" && msg.params?.capabilities) {
            out = structuredClone(msg);
            out.params.capabilities.workspace = {
              ...(out.params.capabilities.workspace ?? {}),
              configuration: true,
            };
            enrichLog.push({
              frame: "initialize", added: "capabilities.workspace.configuration=true",
              why: "composed client answers workspace/configuration (editor pump); "
                + "pyright only sends it when advertised — DECLARED assembly adaptation (V2)",
            });
          }
          ws.send(JSON.stringify(out));
        },
        onMessage(cb) { msgHandlers.push(cb); return () => { const i = msgHandlers.indexOf(cb); if (i >= 0) msgHandlers.splice(i, 1); }; },
        onClose(cb) { closeHandlers.push(cb); return () => { const i = closeHandlers.indexOf(cb); if (i >= 0) closeHandlers.splice(i, 1); }; },
        close() { try { ws.close(); } catch { /* already closed */ } },
        describe() { return { kind: "websocket", url: wsUrl }; },
      });
    }, { once: true });
  });
}
