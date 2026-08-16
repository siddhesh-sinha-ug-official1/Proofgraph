/**
 * §7 — REAL-browser SCREENSHOT tool (assembly tooling, zero deps).
 *
 * HEADLESS-UI round (remediation worklist item 5): this tool is NO LONGER
 * part of the default acceptance gate — run_demo.py's step 3 now drives
 * acceptance/headless/headless_ui.mjs (DOM/a11y + spike-surface pins, ZERO
 * pixel screenshots; Page.captureScreenshot could hang on the Monaco canvas
 * and needed a person to babysit).  Keep this ONLY for manual screenshot
 * capture; run it by hand against a live stack when a human wants pixels.
 *
 * Drives a real Chromium browser (Edge or Chrome, headless=new) over the
 * Chrome DevTools Protocol using Node's built-in WebSocket — no npm installs.
 * Run by hand once a hub + ai + vite stack is up.
 *
 *   node acceptance/headless/browser_shot.mjs \
 *     --url http://localhost:5199 --outdir acceptance/browser \
 *     --prefix moat [--ask] [--click-node <nodeId>]
 *
 * What it captures (evidence JSON on the LAST stdout line):
 *   - full-page PNG screenshots (<prefix>-overview.png, <prefix>-ai.png)
 *   - facts harvested from the LIVE page via the §7.8 spike surfaces
 *     (window.pgGraphWall / window.pgEditorWall pins) — paints, lead guards,
 *     node census, editor status line, analysis state, AI answer text
 *   - optional browser-level brushing: click a React-Flow node DOM element,
 *     then read the editor wall's busLog pin for the byte-identical nodeId.
 *
 * If no Chromium binary is found the script exits 3 with a typed
 * browser-tooling-missing line — the runner logs a graceful SKIP with manual
 * steps (never a fake green).
 *
 * SUB200 restructure (wave 2): the browser launch + CDP client moved to
 * acceptance/headless/ui/{browser,cdp}.mjs (carved from THIS file verbatim
 * — headless_ui.mjs shares them); this file keeps the screenshot flow.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { findBrowser, launchBrowser, MISSING_BROWSER_DETAIL } from "./ui/browser.mjs";
import { openPage, sleep } from "./ui/cdp.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
const has = (name) => process.argv.includes(name);

const url = arg("--url", "http://localhost:5199");
const outdir = arg("--outdir", path.join(process.cwd(), "acceptance", "browser"));
const prefix = arg("--prefix", "shot");
const doAsk = has("--ask");
const clickNodeId = arg("--click-node", null);

const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

const browserExe = findBrowser();
if (!browserExe) {
  out({ ok: false, failureClass: "browser-tooling-missing",
    detail: MISSING_BROWSER_DETAIL });
  process.exit(3);
}

mkdirSync(outdir, { recursive: true });
const { waitForWsUrl, killBrowser } = launchBrowser(browserExe, "pg-browser-");

try {
  const wsUrl = await waitForWsUrl();
  const { cdp, sessionId, evaluate, pollPage, navigate } = await openPage(wsUrl);

  const shoot = async (file) => {
    const { data } = await cdp("Page.captureScreenshot",
      { format: "png", captureBeyondViewport: true }, sessionId);
    const full = path.join(outdir, file);
    writeFileSync(full, Buffer.from(data, "base64"));
    return full;
  };

  await navigate(url);

  // wait until the graph pane rendered nodes (or a named failure banner).
  await pollPage(
    "document.querySelectorAll('.react-flow__node').length > 0 || document.querySelectorAll('.banner-error').length > 0",
    90000, "graph nodes or a named banner");
  // give the editor pane (Monaco + fonts) and layout time to settle; wait for
  // a terminal editor phase when the pane exists.
  await pollPage(
    "(!document.querySelector('.editor-pane-wrap')) || /tier:/.test(document.querySelector('.pane-status-ready, .pane-status-failed')?.textContent ?? '') || document.querySelectorAll('.pane-status').length > 0",
    30000, "editor status line");
  await sleep(4000);

  const shots = [];
  shots.push(await shoot(`${prefix}-overview.png`));

  // facts from the LIVE page — §7.8 spike surfaces (both walls' pins).
  const facts = await evaluate(`(() => {
    const gw = window.pgGraphWall ?? null;
    const dump = gw ? gw.pins.dump() : null;
    const hist = gw ? gw.pins.history() : [];
    const paints = dump ? dump.paints : null;
    return {
      title: document.title,
      nodeCount: document.querySelectorAll('.react-flow__node').length,
      banners: [...document.querySelectorAll('.banner')].map(b => b.textContent),
      // App-shell world: the analysis state line moved into the STATUS BAR
      // (StatusBar.tsx: "applied (N verdicts)"); the old pane selector is
      // kept as the first choice for compatibility, the status bar is the
      // fallback (green-flow round harness fix).
      graphStatusLine: document.querySelector('.pane-graph .pane-status')?.textContent
        ?? document.querySelector('[data-testid="status-bar"]')?.textContent ?? null,
      editorStatusLine: document.querySelector('.editor-pane-wrap .pane-status')?.textContent ?? null,
      legendPresent: !!document.querySelector('.legend'),
      paints,
      paintStatuses: paints ? [...new Set(Object.values(paints).flatMap(p => [p.fillStatus, p.outlineStatus]))] : null,
      outlineWasNullAny: paints ? Object.values(paints).some(p => p.outlineWasNull) : null,
      leadGuardCount: hist.filter(e => e.probeId === 'render.edge.leadGuard').length,
      renderedEdges: document.querySelectorAll('.react-flow__edge').length,
    };
  })()`);

  let brushing = null;
  if (clickNodeId) {
    try {
      brushing = await evaluate(`(async () => {
        const el = document.querySelector('.react-flow__node[data-id="${clickNodeId}"]');
        if (!el) return { attempted: true, found: false };
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        await new Promise(r => setTimeout(r, 800));
        const ew = window.pgEditorWall ?? null;
        const busLog = ew ? (ew.pins.dump().busLog ?? []) : [];
        const reveal = ew ? ew.pins.history().filter(e => e.probeId === 'editor.select.recv.reveal').map(e => e.payload) : [];
        return {
          attempted: true, found: true, clicked: "${clickNodeId}",
          busLogGraphEvents: busLog.filter(e => e.origin === 'graph'),
          reveals: reveal,
          byteIdentical: busLog.some(e => e.origin === 'graph' && e.nodeId === "${clickNodeId}"),
        };
      })()`);
    } catch (e) {
      brushing = { attempted: true, error: String(e) };
    }
  }

  let aiAnswer = null;
  if (doAsk) {
    // App-shell/UI-1C world: the AI panel lives in a TOOL WINDOW behind the
    // rail toggle (data-testid="rail-ai") — open it first if it is closed
    // (green-flow round harness fix; the panel itself is unchanged).
    const askVisible = await evaluate("!!document.querySelector('.ai-ask-row button')");
    if (!askVisible) {
      await evaluate("document.querySelector('[data-testid=\\\"rail-ai\\\"]').click()");
      await pollPage("!!document.querySelector('.ai-ask-row button')", 15000,
        "AI tool window open (rail-ai toggle)");
      await sleep(300);
    }
    await evaluate("document.querySelector('.ai-ask-row button').click()");
    await pollPage("!!document.querySelector('.ai-answer') || !!document.querySelector('.ai-panel .banner-error')",
      60000, "AI answer or a named AI error");
    await sleep(800);
    aiAnswer = await evaluate(`(() => ({
      answer: document.querySelector('.ai-answer')?.textContent ?? null,
      error: document.querySelector('.ai-panel .banner-error')?.textContent ?? null,
      badges: [...document.querySelectorAll('.ai-badges .badge')].map(b => b.textContent),
      toolCallHeads: [...document.querySelectorAll('.tool-call-head')].map(t => t.textContent),
    }))()`);
    shots.push(await shoot(`${prefix}-ai.png`));
  }

  out({ ok: true, browser: browserExe, url, shots, facts, brushing, aiAnswer });
  await killBrowser();
  process.exit(0);
} catch (e) {
  out({ ok: false, failureClass: "browser-shot-failed",
    detail: e instanceof Error ? `${e.message}` : String(e) });
  await killBrowser();
  process.exit(2);
}
