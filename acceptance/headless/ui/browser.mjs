/**
 * Chromium discovery + headless launch (the proven browser_shot.mjs
 * scaffolding, carved VERBATIM — SUB200 restructure, wave 2).  Shared by
 * headless_ui.mjs (the default gate driver) and browser_shot.mjs (the
 * manual screenshot tool).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── find a real Chromium browser ─────────────────────────────────────────────
export const BROWSER_CANDIDATES = [
  process.env.PG_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean);

export function findBrowser() {
  return BROWSER_CANDIDATES.find((c) => existsSync(c)) ?? null;
}

/** The typed browser-tooling-missing detail (identical in both tools). */
export const MISSING_BROWSER_DETAIL =
  `no Chromium binary found (tried: ${BROWSER_CANDIDATES.join("; ")}); ` +
  "manual steps: python hub/serve_app.py + node ai/server.ts + (cd app && npm run dev), open http://localhost:5199";

/**
 * Spawn --headless=new with an ephemeral devtools port and a temp profile.
 * Returns { proc, waitForWsUrl, killBrowser } — waitForWsUrl polls the
 * DevTools ws url off stderr (30 s bound), killBrowser is taskkill /T.
 */
export function launchBrowser(browserExe, tmpPrefix) {
  const userData = mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
  const proc = spawn(browserExe, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userData}`,
    "--no-first-run", "--no-default-browser-check", "--mute-audio",
    "--window-size=1720,1280",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let wsUrl = null;
  let stderrBuf = "";
  proc.stderr.on("data", (d) => {
    stderrBuf += d.toString();
    const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (m && !wsUrl) wsUrl = m[1];
  });

  async function waitForWsUrl() {
    const t0 = Date.now();
    while (!wsUrl) {
      if (Date.now() - t0 > 30000) throw new Error(`no DevTools ws url; stderr: ${stderrBuf.slice(-800)}`);
      await sleep(100);
    }
    return wsUrl;
  }

  async function killBrowser() {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { stdio: "ignore" });
    } catch { /* already gone */ }
    await sleep(500);
  }

  return { proc, waitForWsUrl, killBrowser };
}
