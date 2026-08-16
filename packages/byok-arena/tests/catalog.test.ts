// §3 rules 3+8: the cell enumerates its own leads; a lead that exists but
// isn't in the catalog is a bug (enforced by the bus at emit time, re-proven
// here); every §6-mandated probeId is present; no node/edge kinds exist (§4).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalog } from "../src/probe/catalog.ts";
import { ProbeBus } from "../src/probe/bus.ts";
import { makeTestCell, runSkeleton } from "./helpers.ts";

const PROVIDERS = ["anthropic", "openai", "gemini"];

const PER_PROVIDER_MANDATED = [
  "validateKey.request", "validateKey.response", "validateKey.honestCeiling",
  "chat.input", "chat.authHeader", "chat.toolDecl", "chat.msgReshape", "chat.maxTokens",
  "chat.hostAllowlist", "chat.request", "chat.response.raw", "chat.rateLimitHeaders", "chat.timing",
  "normalize.envelopePath",
  "normalize.toolCall.args.raw", "normalize.toolCall.args.normalized",
  "normalize.toolCall.id.raw", "normalize.toolCall.id.normalized", "normalize.toolCall",
  "normalize.usage.raw", "normalize.usage.normalized", "normalize.stopReason", "normalize.output",
  "submit.input", "submit.resultShape", "submit.idEcho", "submit.request", "submit.output",
  "error.map", "error.retryDecision", "error.requestId",
];

const FIXED_MANDATED = [
  // 6.A
  "vault.store.input", "vault.store.encrypt", "vault.store.output",
  "vault.retrieve.input", "vault.retrieve.scopeCheck", "vault.retrieve.scopeViolation",
  "vault.retrieve.decrypt", "vault.redact.boundary", "vault.revoke", "vault.timing",
  // provider-specific §6 leads
  "adapter.anthropic.error.spikeGuard",
  "adapter.openai.chat.toolDecl.responses", "adapter.openai.chat.endpointChoice",
  "adapter.openai.normalize.usage.streamGuard", "adapter.openai.submit.resultShape.responses",
  "adapter.openai.error.quotaDisambig",
  "adapter.gemini.chat.transportChoice", "adapter.gemini.normalize.toolCall.id.synthesized",
  "adapter.gemini.normalize.textAndCall", "adapter.gemini.error.quotaDisambig",
  // 6.H
  "cost.estimate.input", "cost.estimate.lookup", "cost.estimate.tierCliff",
  "cost.estimate.reasoningSplit", "cost.estimate.compute", "cost.estimate.output",
  "cost.estimate.snapshotWarn",
  // 6.I
  "arena.dispatch.task", "arena.dispatch.A", "arena.dispatch.B",
  "arena.collect.A", "arena.collect.B",
  "arena.compare.sameToolName", "arena.compare.argsAreObjects", "arena.compare.argsEquivalent",
  "arena.compare.callIdEchoed", "arena.compare.resultShape", "arena.compare.usageMapped",
  "arena.compare.costPriced", "arena.verdict", "arena.honestCeiling",
  // 6.J
  "secret.leak.scan", "secret.leak.redactionShape", "secret.leak.urlScan",
];

test("catalog contains every §6-mandated lead (wildcards expanded per provider)", () => {
  const ids = new Set(buildCatalog().map((e) => e.probeId));
  const missing: string[] = [];
  for (const p of PROVIDERS) {
    for (const suffix of PER_PROVIDER_MANDATED) {
      const id = `adapter.${p}.${suffix}`;
      if (!ids.has(id)) missing.push(id);
    }
  }
  for (const id of FIXED_MANDATED) if (!ids.has(id)) missing.push(id);
  assert.deepEqual(missing, [], `missing catalog entries:\n${missing.join("\n")}`);
});

test("catalog probeIds are unique and every entry is typed with a valid kind", () => {
  const catalog = buildCatalog();
  const seen = new Set<string>();
  const validKinds = new Set(["input", "output", "value", "decision", "branch", "edge", "node", "state", "call", "timing", "error"]);
  for (const entry of catalog) {
    assert.ok(!seen.has(entry.probeId), `duplicate probeId ${entry.probeId}`);
    seen.add(entry.probeId);
    assert.ok(validKinds.has(entry.kind), `invalid kind ${entry.kind} on ${entry.probeId}`);
    assert.ok(entry.payloadType.length > 0 && entry.description.length > 0,
      `${entry.probeId} must carry payloadType + description`);
  }
});

test("no node/edge kinds exist — this cell mints no graph elements (§4, intentional and honest)", () => {
  for (const entry of buildCatalog()) {
    assert.notEqual(entry.kind, "node", `${entry.probeId} claims kind node`);
    assert.notEqual(entry.kind, "edge", `${entry.probeId} claims kind edge`);
  }
});

test("spot-check §6 kinds: scopeCheck=decision, scopeViolation=branch, verdict=decision, error.map=error, timing=timing", () => {
  const byId = new Map(buildCatalog().map((e) => [e.probeId, e.kind]));
  assert.equal(byId.get("vault.retrieve.scopeCheck"), "decision");
  assert.equal(byId.get("vault.retrieve.scopeViolation"), "branch");
  assert.equal(byId.get("arena.verdict"), "decision");
  assert.equal(byId.get("adapter.openai.error.map"), "error");
  assert.equal(byId.get("adapter.gemini.normalize.toolCall.id.synthesized"), "branch");
  assert.equal(byId.get("vault.timing"), "timing");
  assert.equal(byId.get("adapter.anthropic.chat.request"), "call");
});

test("bus refuses an uncatalogued emit and a kind-mismatched emit", () => {
  const bus = new ProbeBus(buildCatalog());
  assert.throws(() => bus.emit("not.a.real.lead", "x", "value", {}),
    /not in catalog/);
  assert.throws(() => bus.emit("arena.verdict", "arena", "value", {}),
    /kind mismatch/);
});

test("after a full skeleton run, every emitted probeId is in probeCatalog()", async () => {
  const cell = makeTestCell();
  await runSkeleton(cell);
  cell.runSecretLeakScan();
  const ids = new Set(cell.probeCatalog().map((e) => e.probeId));
  for (const ev of cell.history()) {
    assert.ok(ids.has(ev.probeId), `emitted lead not in catalog: ${ev.probeId}`);
  }
  // and the run is genuinely probe-dense
  assert.ok(cell.history().length > 100, `expected a gajillion leads, got ${cell.history().length}`);
});

test("tap() delivers live events for one lead and unsubscribes cleanly", async () => {
  const cell = makeTestCell();
  const seen: unknown[] = [];
  const untap = cell.tap("arena.verdict", (e) => seen.push(e.payload));
  await runSkeleton(cell);
  assert.equal(seen.length, 1);
  assert.equal((seen[0] as { normalizationHolds: boolean }).normalizationHolds, true);
  untap();
  await runSkeleton(cell);
  assert.equal(seen.length, 1, "after untap, no further deliveries");
});

test("dump() returns the entire internal state (events, logs, errors, vault ciphertext refs)", async () => {
  const cell = makeTestCell();
  await runSkeleton(cell);
  const d = cell.dump();
  assert.equal(d.bus.cellId, "ai.outlet");
  assert.equal(d.bus.eventCount, d.bus.events.length);
  assert.ok(d.bus.eventCount > 0);
  assert.ok(d.bus.catalogSize > 100);
  assert.equal(d.vault.records.length, 2);
  for (const r of d.vault.records) {
    assert.match(r.keyRef, /^kref_/);
    assert.ok(r.cipherLen > 0);
  }
});
