// §6.J — the one redaction, PROVEN (build-stopping). After a full run touching
// all three providers, the scan walks the ENTIRE probe history, all logs, and
// all captured errors: the plaintext key appears NOWHERE; the only shown form
// is {present,last4,provider,keyLen}; no key ever enters a URL. Includes a
// negative control proving the scanner actually catches a planted leak.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, runSkeleton, TEST_KEYS } from "./helpers.ts";
import { executeWeatherTool, weatherTask } from "../src/testkit/goldens.ts";
import { redactKey, _clearSecretsForTest } from "../src/probe/redact.ts";

test("full three-provider run: rawKeyFound===false across every lead, log line, error, and URL", async () => {
  _clearSecretsForTest();
  const cell = makeTestCell();
  await runSkeleton(cell); // vault + anthropic + openai through the arena

  // thicken with the third provider: gemini end-to-end incl. submit
  cell.vault.store("u1", "gemini", TEST_KEYS.gemini);
  const gk = cell.vault.retrieve("u1", "u1", "gemini");
  await cell.adapters.gemini.validateKey(gk);
  const g = await cell.adapters.gemini.chat({
    apiKey: gk, model: "gemini-3.5-flash", messages: weatherTask.messages, tools: weatherTask.tools,
  });
  await cell.adapters.gemini.submitToolResults({
    apiKey: gk, model: "gemini-3.5-flash", messages: weatherTask.messages,
    results: [{ toolCallId: g.toolCalls[0].id, name: g.toolCalls[0].name, output: executeWeatherTool() }],
  });

  const report = cell.runSecretLeakScan();
  assert.equal(report.rawKeyFound, false, `leak sites: ${JSON.stringify(report.leakSites)}`);
  assert.equal(report.keyInUrl, false);
  assert.ok(report.secretsSearched >= 3, "all three pasted keys were searched for");
  assert.ok(report.scannedEvents > 150, `probe-dense run scanned (${report.scannedEvents} events)`);
  assert.ok(report.scannedLogs >= 1 && report.scannedErrors >= 0);

  // the scan's own leads
  const scanEv = cell.bus.last("secret.leak.scan")!.payload as any;
  assert.equal(scanEv.rawKeyFound, false);
  const shape = cell.bus.last("secret.leak.redactionShape")!.payload as any;
  assert.deepEqual(Object.keys(shape.shownForm).sort(), ["keyLen", "last4", "present", "provider"]);
  assert.equal(shape.shownForm.last4.length, 4);
  const urlScan = cell.bus.last("secret.leak.urlScan")!.payload as any;
  assert.equal(urlScan.keyInUrl, false);
  assert.match(urlScan.reason, /x-goog-api-key/);

  // belt and suspenders: brute-force the entire dump
  const dumped = JSON.stringify(cell.dump());
  for (const key of Object.values(TEST_KEYS)) {
    assert.ok(!dumped.includes(key), `dump contains raw key ending ${key.slice(-4)}`);
  }
});

test("NEGATIVE CONTROL: the scanner catches a deliberately planted leak (in a log line)", () => {
  _clearSecretsForTest();
  const cell = makeTestCell();
  cell.vault.store("u1", "anthropic", TEST_KEYS.anthropic); // registers the secret
  cell.bus.log(`oops, accidentally logged ${TEST_KEYS.anthropic}`); // the planted bug
  const report = cell.runSecretLeakScan();
  assert.equal(report.rawKeyFound, true, "a scanner that can't find a plant proves nothing");
  assert.equal(report.leakSites[0].where, "log");
  assert.equal(report.leakSites[0].secretLast4, TEST_KEYS.anthropic.slice(-4));
});

test("NEGATIVE CONTROL: a planted leak in an error object is caught too", () => {
  _clearSecretsForTest();
  const cell = makeTestCell();
  cell.vault.store("u1", "openai", TEST_KEYS.openai);
  cell.bus.recordError(new Error(`request failed for key ${TEST_KEYS.openai}`));
  const report = cell.runSecretLeakScan();
  assert.equal(report.rawKeyFound, true);
  assert.equal(report.leakSites[0].where, "error");
});

test("redactKey shows at most presence + last-4, whatever the key", () => {
  const r = redactKey("sk-ant-api03-SUPER-SECRET-VALUE-xyzw", "anthropic");
  assert.deepEqual(r, { present: true, last4: "xyzw", provider: "anthropic", keyLen: 36 });
  const empty = redactKey("", "openai");
  assert.equal(empty.present, false);
  assert.equal(empty.keyLen, 0);
});
