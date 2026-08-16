/**
 * §7 step 3 — HEADLESS UI ACCEPTANCE driver (remediation worklist item 5).
 *
 * The DEFAULT browser-check path of acceptance/run_demo.py: a REAL Chromium
 * (Edge or Chrome, --headless=new over CDP, Node's built-in WebSocket, zero
 * npm installs — the proven browser_shot.mjs scaffolding, reused) asserting
 * the FULL on-screen path through DOM/a11y reads and the app's §7.8 spike
 * surfaces (window.pgGraphWall / pgEditorWall / pgShellLog / pgShellTabs pins)
 * — ZERO pixel screenshots (Page.captureScreenshot is never called; the old
 * screenshot capture could hang on the Monaco canvas and needed a person to
 * babysit it; browser_shot.mjs remains as an OPTIONAL manual tool).
 *
 *   node acceptance/headless/headless_ui.mjs --url <vite-url?hub=&ai=> \
 *     --spec <spec.json>
 *
 * The spec (written by run_demo.py from the SAME analyses the §7 checks
 * asserted — expectations are computed, never hardcoded) drives, per page:
 *   1. file opens with VERDICT MARKERS: the shell's own file-open probe
 *      (shell.file.open, source hub-fs), the a11y tab strip (role=tab
 *      aria-selected), and cell 4's editor gutter pins
 *      (editor.verdict.gutter.paint — glyph classes, never pixels);
 *   2. the graph renders nodes COLORED BY VERDICT: the graph wall's own
 *      dump().paints (incl. the kernel greens #2E7D32 on the lean page) plus
 *      the DOM presence of each node id ([data-id] byte-identical);
 *   3. BRUSHING both directions: a real graph-node click → the editor wall's
 *      busLog/reveal pins carry the SAME byte-identical id (and the status
 *      bar's a11y role=status selection shows it); a REAL CDP mouse click into
 *      the Monaco line of a declaration → the editor wall emits the select and
 *      the graph wall's link.select.in/selection pins carry the SAME id;
 *   4. the UNKNOWN-TIER input renders unknown, never green (paints, gutter,
 *      ghost placeholders), and the AI outlet answers honestly (DOM).
 *
 * Evidence JSON on the LAST stdout line: { ok, page, facts, checks[], ... } —
 * run_demo.py re-verifies the byte-level id equalities in python (UTF-8
 * arrays) against ITS independent parse of the analysis.
 *
 * Exit codes: 0 = all checks pass · 2 = a named check failed (evidence line
 * says which) · 3 = browser-tooling-missing (typed; the runner logs a SKIP).
 *
 * SUB200 restructure (wave 2): this file is the CLI FACADE — same
 * invocation, same evidence line, same exit codes; the scaffolding and the
 * six phases live in acceptance/headless/ui/*.mjs (carved verbatim).
 */
import { readFileSync } from "node:fs";
import { findBrowser, launchBrowser, MISSING_BROWSER_DETAIL } from "./ui/browser.mjs";
import { openPage, sleep } from "./ui/cdp.mjs";
import { waitAppReady, readFacts, phaseFacts } from "./ui/facts.mjs";
import { phaseOpenFiles } from "./ui/openfile.mjs";
import { phaseGutter } from "./ui/gutter.mjs";
import { phaseBrush } from "./ui/brush.mjs";
import { phaseAi } from "./ui/ai.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
const url = arg("--url", null);
const specPath = arg("--spec", null);
const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const J = (v) => JSON.stringify(v);

if (!url || !specPath) {
  out({ ok: false, failureClass: "bad-invocation", detail: "--url and --spec are required" });
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const E = spec.expect;

// ── named checks — PASS/FAIL with detail, never silent ───────────────────────
const checks = [];
let anyFail = false;
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail });
  if (!pass) anyFail = true;
  return !!pass;
}

const browserExe = findBrowser();
if (!browserExe) {
  out({ ok: false, failureClass: "browser-tooling-missing",
    detail: MISSING_BROWSER_DETAIL });
  process.exit(3);
}

const { waitForWsUrl, killBrowser } = launchBrowser(browserExe, "pg-ui-");

try {
  const wsUrl = await waitForWsUrl();
  const { evaluate, pollPage, realClick, navigate } = await openPage(wsUrl);
  await navigate(url);

  // the shared phase context: CDP surface + the check registry + the spec
  const ctx = { evaluate, pollPage, realClick, check, E, J, sleep };

  await waitAppReady(ctx);                            // phase 1
  let { facts } = await phaseFacts(ctx);              // phase 2
  const { initialOpen, explorerOpen } = await phaseOpenFiles(ctx); // phase 3
  const gutter = await phaseGutter(ctx);              // phase 4
  const brush = await phaseBrush(ctx);                // phase 5
  const aiAnswer = await phaseAi(ctx);                // phase 6

  facts = await evaluate(readFacts); // final snapshot (post-interactions)
  out({ ok: !anyFail, page: spec.page, browser: browserExe, url,
    facts, initialOpen, explorerOpen, gutter, brush, aiAnswer, checks });
  await killBrowser();
  process.exit(anyFail ? 2 : 0);
} catch (e) {
  out({ ok: false, page: spec.page, failureClass: "headless-ui-failed",
    detail: e instanceof Error ? `${e.message}` : String(e), checks });
  await killBrowser();
  process.exit(2);
}
