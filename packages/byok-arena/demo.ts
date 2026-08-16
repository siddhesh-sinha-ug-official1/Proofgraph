// Runnable walking skeleton — offline, on the golden fake transport.
//   node demo.ts            → run the arena and print the verdict + key leads
//   node demo.ts --live     → same flow against the real network (needs env keys
//                             ANTHROPIC_API_KEY / OPENAI_API_KEY set by YOU)
// This file is a driver, not part of the cell (the import-boundary gate covers src/ only).

import { createCell } from "./src/index.ts";
import { providerHappyFetch } from "./src/testkit/fakefetch.ts";
import { executeWeatherTool, weatherTask } from "./src/testkit/goldens.ts";

const live = process.argv.includes("--live");
const cell = createCell(live ? {} : { fetchImpl: providerHappyFetch() });

const keyA = live ? (process.env.ANTHROPIC_API_KEY ?? "") : "sk-ant-demo-key-0001";
const keyB = live ? (process.env.OPENAI_API_KEY ?? "") : "sk-oai-demo-key-0002";
if (live && (!keyA || !keyB)) {
  console.error("--live needs ANTHROPIC_API_KEY and OPENAI_API_KEY in the environment (your keys, your bill)");
  process.exit(1);
}

// vault roundtrip (per-user encrypted at rest, plaintext only in memory)
cell.vault.store("demo-user", "anthropic", keyA);
cell.vault.store("demo-user", "openai", keyB);
const a = cell.vault.retrieve("demo-user", "demo-user", "anthropic");
const b = cell.vault.retrieve("demo-user", "demo-user", "openai");

// live-tap one lead while the arena runs
cell.tap("arena.verdict", (e) => console.log("\n[tap] arena.verdict →", JSON.stringify(e.payload, null, 2)));

const report = await cell.runArena({
  task: weatherTask,
  sideA: { adapter: cell.adapters.anthropic, model: "claude-sonnet-5", apiKey: a },
  sideB: { adapter: cell.adapters.openai, model: "gpt-5.6", apiKey: b },
  executeTool: () => executeWeatherTool(),
});

console.log("\n=== ARENA (the round-trip gate) ===");
console.log("normalizationHolds:", report.normalizationHolds);
console.log("side A toolCall:", JSON.stringify(report.resultA.toolCalls[0]));
console.log("side B toolCall:", JSON.stringify(report.resultB.toolCalls[0]));
console.log("costs (USD):", report.costA.toFixed(6), "/", report.costB.toFixed(6));
console.log("continuation A:", report.continuationA?.text);
console.log("continuation B:", report.continuationB?.text);

const scan = cell.runSecretLeakScan();
console.log("\n=== SECRET LEAK SCAN ===");
console.log(`events=${scan.scannedEvents} logs=${scan.scannedLogs} errors=${scan.scannedErrors} secrets=${scan.secretsSearched}`);
console.log("rawKeyFound:", scan.rawKeyFound, "| keyInUrl:", scan.keyInUrl);

console.log("\n=== PROBE SURFACE ===");
console.log("catalogued leads:", cell.probeCatalog().length);
console.log("events this run: ", cell.history().length);
console.log("\nfirst 12 leads of the stream:");
for (const ev of cell.history().slice(0, 12)) {
  console.log(`  #${String(ev.logicalClock).padStart(3)} ${ev.kind.padEnd(8)} ${ev.probeId}`);
}
console.log("\n(dump(), tap(probeId), history(), probeCatalog() — all live on the cell object)");
