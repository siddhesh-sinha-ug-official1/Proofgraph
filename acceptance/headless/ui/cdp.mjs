/**
 * Minimal CDP client over Node's built-in WebSocket (the proven
 * browser_shot.mjs scaffolding, carved VERBATIM — SUB200 restructure,
 * wave 2).  openPage() connects, creates a page target and returns the
 * evaluate/poll/click/navigate surface both drivers use.
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openPage(wsUrl) {
  const ws = new globalThis.WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("CDP ws connect failed")), { once: true });
  });
  let msgId = 0;
  const pending = new Map();
  const eventWaiters = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`CDP ${msg.error.message}`));
      else res(msg.result);
    } else if (msg.method) {
      for (const w of [...eventWaiters]) w(msg);
    }
  });
  const cdp = (method, params = {}, sessionId = undefined) =>
    new Promise((res, rej) => {
      const id = ++msgId;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const waitEvent = (method, sessionId, timeoutMs, what) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout waiting CDP event ${what}`)), timeoutMs);
      const w = (msg) => {
        if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
          clearTimeout(t);
          eventWaiters.splice(eventWaiters.indexOf(w), 1);
          res(msg.params);
        }
      };
      eventWaiters.push(w);
    });

  const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  await cdp("Page.enable", {}, sessionId);
  await cdp("Runtime.enable", {}, sessionId);
  await cdp("Emulation.setDeviceMetricsOverride",
    { width: 1720, height: 1280, deviceScaleFactor: 1, mobile: false }, sessionId);

  const evaluate = async (expression) => {
    const r = await cdp("Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`page eval failed: ${r.exceptionDetails.text} ${JSON.stringify(r.exceptionDetails.exception?.description ?? "")}`);
    return r.result.value;
  };
  const pollPage = async (expr, timeoutMs, what) => {
    const t1 = Date.now();
    for (;;) {
      let v = null;
      try { v = await evaluate(expr); } catch { /* page mid-navigation */ }
      if (v) return v;
      if (Date.now() - t1 > timeoutMs) throw new Error(`timeout waiting in page: ${what}`);
      await sleep(400);
    }
  };
  /** REAL input (Monaco listens for genuine mouse events, not synthetic ones). */
  const realClick = async (x, y) => {
    await cdp("Input.dispatchMouseEvent",
      { type: "mousePressed", x, y, button: "left", clickCount: 1 }, sessionId);
    await cdp("Input.dispatchMouseEvent",
      { type: "mouseReleased", x, y, button: "left", clickCount: 1 }, sessionId);
  };

  const navigate = async (url) => {
    const loadFired = waitEvent("Page.loadEventFired", sessionId, 60000, "loadEventFired");
    await cdp("Page.navigate", { url }, sessionId);
    await loadFired;
  };

  return { cdp, waitEvent, sessionId, evaluate, pollPage, realClick, navigate };
}
