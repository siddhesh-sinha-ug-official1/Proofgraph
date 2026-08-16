/**
 * §7(e) — the AI check, headless, through the V6 outlet (FAKE transport
 * goldens; no real keys anywhere).  Spawned by acceptance/run_demo.py with a
 * LIVE hub base (the runner's in-process hub serving the REAL moat pipeline +
 * attached analysis).
 *
 *   node acceptance/headless/ai_check.mjs --hub http://127.0.0.1:<port>
 *
 * What happens (all REAL assembly code, reused not reinvented):
 *   createAiServer (ai/server.ts, FAKE transport default — cell 6's own
 *   testkit fakefetch; keys live ONLY in this process) → POST /ask
 *   {"question": "what is unused?"} → the outlet executes the listUnused tool
 *   against the hub-served graph (fresh same-snapshot /graph + /query pair)
 *   → the deterministic FAKE model composes its answer ONLY from the
 *   tool_result bytes → the answer must name the REAL unused Node.id.
 *
 * Output: ONE JSON line on stdout (the evidence run_demo.py asserts on).
 * Exit 0 iff the ask round-tripped; the runner owns the content assertions.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const hubBase = arg("--hub", "http://127.0.0.1:8477");
const question = arg("--question", "what is unused?");

const { createAiServer } = await import(
  new URL("file:///" + path.join(ROOT, "ai", "server.ts").replace(/\\/g, "/")));

let handle = null;
try {
  handle = await createAiServer({ port: 0, hubBase, transport: "fake" });
  const resp = await fetch(`http://127.0.0.1:${handle.port}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const body = await resp.json();
  process.stdout.write(JSON.stringify({
    ok: resp.status === 200 && body.ok === true,
    httpStatus: resp.status,
    question,
    hubBase,
    transport: body.transport ?? null,
    provider: body.provider ?? null,
    model: body.model ?? null,
    answer: body.answer ?? null,
    stopReason: body.stopReason ?? null,
    toolRounds: body.toolRounds ?? null,
    toolCalls: body.toolCalls ?? null,
    graphFacts: body.graphFacts ?? null,
    failureClass: body.failureClass ?? null,
    detail: body.detail ?? null,
  }) + "\n");
  process.exitCode = resp.status === 200 && body.ok === true ? 0 : 2;
} catch (e) {
  process.stdout.write(JSON.stringify({
    ok: false,
    failureClass: "ai-check-crashed",
    detail: e instanceof Error ? `${e.message}\n${e.stack}` : String(e),
  }) + "\n");
  process.exitCode = 2;
} finally {
  if (handle) await handle.close().catch(() => {});
}
