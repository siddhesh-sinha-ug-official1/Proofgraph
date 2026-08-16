/**
 * §7(g) — the LSP squiggle against the MOAT file, end-to-end, headless.
 *
 * V2's exact test path REUSED (vessels/test_v2_squiggle.mjs, credited):
 *
 *   pyright (cell 2's measured spawn form; REAL battery run by
 *   vessels/v2_hub_runner.py — face tier byte-equals the measuredTier pin or
 *   the runner refuses to come up)
 *     ⇄ hub WS /lsp bridge (content-opaque, sha256-ledgered)
 *     ⇄ MessageTransports over Node's built-in WebSocket (V2's transport,
 *       incl. its single DECLARED initialize enrichment — logged, asserted
 *       to fire exactly once)
 *     ⇄ createEditorWall (HEADLESS, cell 4's own StubEditorAdapter)
 *
 * The opened document is a TEMP COPY of acceptance/fixtures/moatpkg with a
 * type error INJECTED at the end of core.py — the fixture is NEVER mutated
 * (sha256 before/after printed; run_demo.py re-verifies independently).
 * Schema nodes are the REAL analysis-moat.json core.py nodes (ids verbatim;
 * span.file remapped to the temp doc's pyright-canonical uri — EditorPane's
 * declared span-file remap bound; byte spans untouched and still valid
 * because the injection appends strictly after every span).
 *
 * PASS = a diagnostic lands at EXACTLY the injected expression's byte span
 * with pyright's real message, uri+version guards applied (not dropped),
 * wall + capability wall torn down (shutdown pin terminated:true, runner
 * exit 0).  Output: JSON lines on stdout; the last line is the evidence
 * object run_demo.py asserts on.
 *
 * SUB200 restructure (wave 2): this file is the CLI FACADE — same
 * invocation, same JSON lines, same exit codes; the staging lives in
 * squiggle/stage.mjs and the transports in squiggle/runner.mjs (verbatim).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROOT, ES_DIST, ERR_EXPR, URI, NODES, variantText, pkgDir,
  expectedByteStart, expectedByteEnd, fixtureShaBefore, fixtureShaNow,
} from "./squiggle/stage.mjs";
import { Runner, connectTransports, until } from "./squiggle/runner.mjs";

const { createEditorWall } = await import(
  pathToFileURL(path.join(ES_DIST, "src", "wall.js")));
const { LocalSelectionBus } = await import(
  pathToFileURL(path.join(ES_DIST, "src", "seams", "bus.js")));
const { StubEditorAdapter } = await import(
  pathToFileURL(path.join(ES_DIST, "test", "stub", "stub-adapter.js")));

const evts = (wall, id) => wall.pins.history().filter((e) => e.probeId === id);
const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

let runner = null;
let evidence = { ok: false };
try {
  const proc = spawn("python", [path.join(ROOT, "vessels", "v2_hub_runner.py")],
    { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  runner = new Runner(proc);
  out({ stage: "battery", note: "running cell 2's REAL measured battery (v2_hub_runner.py)…" });
  const ready = await runner.next(400000, "ready line (capability battery)");
  if (!ready.ready) throw new Error(`runner not ready: ${JSON.stringify(ready)}`);
  out({ stage: "ready", faceTier: ready.faceTier, pinTier: ready.pinTier });

  const enrichLog = [];
  const wsUrl = `ws://127.0.0.1:${ready.wsPort}/lsp`;
  const capability = () => ({
    tier: ready.faceTier,            // MEASURED, never asserted
    handle: {
      kind: "websocket",
      languageId: "python",
      connect: async () => connectTransports(wsUrl, enrichLog),
      describe: () => ({ kind: "websocket", url: wsUrl }),
    },
  });

  const wall = await createEditorWall({
    adapter: new StubEditorAdapter(),
    capability,
    bus: new LocalSelectionBus(),
    schemaNodes: NODES,
    file: { uri: URI, bytes: new Uint8Array(Buffer.from(variantText, "utf8")), languageId: "python", lang: "python" },
    connector: { maxReconnectAttempts: 2, backoffMs: [0, 0] },
    wallClock: () => null,
  });

  let markers, target;
  try {
    // wait for THE type-error squiggle (other diagnostics, e.g. import
    // resolution notes for the staged copy, may arrive in the same batch —
    // recorded verbatim, not hidden).
    await until(() => evts(wall, "editor.diag.marker.set")
      .some((e) => /Operator "\+" not supported/.test(String(e.payload.message))),
      180000, 'publishDiagnostics with the injected type error', 300);

    markers = evts(wall, "editor.diag.marker.set").map((e) => e.payload);
    target = markers.find((m) => /Operator "\+" not supported/.test(String(m.message)));
    const span = evts(wall, "editor.diag.map.span")
      .map((e) => e.payload).find((s) => s.diagId === target.diagId);
    if (!span) throw new Error("no editor.diag.map.span for the type-error diagId");

    const uriGuard = evts(wall, "editor.diag.uri.guard").at(-1).payload;
    const verGuard = evts(wall, "editor.diag.version.guard").at(-1).payload;

    evidence = {
      ok: span.byteStart === expectedByteStart
        && span.byteEnd === expectedByteEnd
        && target.severity === "error"
        && uriGuard.action === "apply"
        && uriGuard.diagUri === URI
        && verGuard.action === "apply"
        && enrichLog.length === 1,
      measuredTier: ready.faceTier,
      pinTier: ready.pinTier,
      uri: URI,
      injectedExpr: ERR_EXPR,
      expectedByteStart, expectedByteEnd,
      gotByteStart: span.byteStart, gotByteEnd: span.byteEnd,
      severity: target.severity,
      message: target.message,
      allMarkers: markers.map((m) => ({ severity: m.severity, message: m.message })),
      uriGuard: { action: uriGuard.action, diagUri: uriGuard.diagUri },
      versionGuard: { action: verGuard.action },
      initializeEnrichments: enrichLog.length,
      stagedVariant: path.join(pkgDir, "core.py"),
    };
  } finally {
    await wall.dispose("squiggle check complete");
  }

  const down = await runner.cmd("shutdown", 60000);
  const exitCode = await runner.exited;
  evidence.shutdown = {
    ok: down.ok === true,
    wallShutdownTerminated: down.wallShutdownPin?.terminated === true,
    childExitCode: down.childExitCode,
    runnerExitCode: exitCode,
  };
  evidence.ok = evidence.ok && down.ok === true
    && down.wallShutdownPin?.terminated === true && exitCode === 0;
} catch (e) {
  evidence = { ok: false, failureClass: "squiggle-check-failed",
    detail: e instanceof Error ? `${e.message}` : String(e) };
} finally {
  if (runner && runner.proc.exitCode === null) runner.proc.kill();
}

evidence.fixtureShaBefore = fixtureShaBefore;
evidence.fixtureShaAfter = fixtureShaNow();
evidence.fixtureUntouched = JSON.stringify(evidence.fixtureShaBefore) === JSON.stringify(evidence.fixtureShaAfter);
evidence.ok = evidence.ok === true && evidence.fixtureUntouched === true;
out({ stage: "evidence", ...evidence });
process.exit(evidence.ok ? 0 : 2);
