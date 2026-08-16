// §6.A Key Vault: per-user isolation enforced at every read, encrypt-at-rest,
// redaction chokepoint, revoke/rotate. Every assertion reads PROBE output
// (§3 rule 7), not just return values.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, payloadsOf, TEST_KEYS } from "./helpers.ts";

test("store→retrieve roundtrip: ciphertext at rest, plaintext only in memory, probes redacted", () => {
  const cell = makeTestCell();
  const { stored, keyRef } = cell.vault.store("u1", "anthropic", TEST_KEYS.anthropic);
  assert.equal(stored, true);
  assert.match(keyRef, /^kref_/);

  const storeInput = payloadOf(cell, "vault.store.input");
  assert.equal(storeInput.userId, "u1");
  assert.equal(storeInput.key.present, true);
  assert.equal(storeInput.key.last4, TEST_KEYS.anthropic.slice(-4));
  assert.equal(storeInput.key.keyLen, TEST_KEYS.anthropic.length);
  assert.ok(!JSON.stringify(storeInput).includes(TEST_KEYS.anthropic), "plaintext never in the store probe");

  const enc = payloadOf(cell, "vault.store.encrypt");
  assert.ok(enc.cipherLen > 0);
  assert.equal(enc.kmsMode, "perUser");
  assert.equal(enc.keyRef, keyRef);

  const plain = cell.vault.retrieve("u1", "u1", "anthropic");
  assert.equal(plain, TEST_KEYS.anthropic);

  const scope = payloadOf(cell, "vault.retrieve.scopeCheck");
  assert.equal(scope.allow, true);
  assert.equal(scope.reason, "authUserId matches record userId");
  assert.ok(scope.branchNotTaken.includes("deny"), "the branch NOT taken is recorded");

  const dec = payloadOf(cell, "vault.retrieve.decrypt");
  assert.equal(dec.ok, true);
  assert.equal(dec.key.last4, TEST_KEYS.anthropic.slice(-4));
  assert.ok(!JSON.stringify(dec).includes(TEST_KEYS.anthropic));

  // redaction chokepoint exercised on both store and retrieve
  const boundaries = payloadsOf(cell, "vault.redact.boundary");
  assert.deepEqual(boundaries.map((b) => b.site), ["vault.store", "vault.retrieve"]);
});

test("cross-user read: scopeCheck denies, scopeViolation branch fires, throw — no plaintext path", () => {
  const cell = makeTestCell();
  cell.vault.store("u1", "openai", TEST_KEYS.openai);
  assert.throws(() => cell.vault.retrieve("attacker", "u1", "openai"), /scope violation/);

  const scope = payloadOf(cell, "vault.retrieve.scopeCheck");
  assert.equal(scope.allow, false);
  assert.equal(scope.reason, "authUserId != recordUserId");

  const violation = payloadOf(cell, "vault.retrieve.scopeViolation");
  assert.deepEqual(violation, {
    authUserId: "attacker", requestedUserId: "u1", provider: "openai", denied: true,
  });
  // and no decrypt event happened
  assert.equal(cell.bus.find("vault.retrieve.decrypt").length, 0);
});

test("retrieve miss: not-found branch fires with found:false", () => {
  const cell = makeTestCell();
  assert.throws(() => cell.vault.retrieve("u1", "u1", "gemini"), /no key stored/);
  assert.deepEqual(payloadOf(cell, "vault.retrieve.miss"), { userId: "u1", provider: "gemini", found: false });
});

test("revoke deletes; re-store over an existing key surfaces action:replace", () => {
  const cell = makeTestCell();
  cell.vault.store("u1", "anthropic", TEST_KEYS.anthropic);
  cell.vault.store("u1", "anthropic", "sk-ant-rotated-9999");
  const revokes = payloadsOf(cell, "vault.revoke");
  assert.deepEqual(revokes[0], { userId: "u1", provider: "anthropic", action: "replace" });
  assert.equal(cell.vault.retrieve("u1", "u1", "anthropic"), "sk-ant-rotated-9999");

  cell.vault.revoke("u1", "u1", "anthropic");
  const revokes2 = payloadsOf(cell, "vault.revoke");
  assert.deepEqual(revokes2[revokes2.length - 1], { userId: "u1", provider: "anthropic", action: "delete" });
  assert.throws(() => cell.vault.retrieve("u1", "u1", "anthropic"), /no key stored/);
});

test("cross-user revoke is denied like a read", () => {
  const cell = makeTestCell();
  cell.vault.store("u1", "openai", TEST_KEYS.openai);
  assert.throws(() => cell.vault.revoke("attacker", "u1", "openai"), /scope violation/);
});

test("storage-mode decision (§5.6) recorded at construction with the branch not taken", () => {
  const cell = makeTestCell();
  const mode = payloadOf(cell, "vault.storageMode");
  assert.equal(mode.chosen, "server-side-encrypted");
  assert.equal(mode.alt, "client-side-only");
  assert.ok(mode.branchNotTaken.includes("client-side-only"));
});

test("dump() exposes ciphertext refs only — never the key, in any encoding", () => {
  const cell = makeTestCell();
  cell.vault.store("u1", "anthropic", TEST_KEYS.anthropic);
  const dumped = JSON.stringify(cell.dump());
  assert.ok(!dumped.includes(TEST_KEYS.anthropic), "dump must not contain plaintext key");
  assert.ok(dumped.includes("kref_"), "dump carries the ciphertext handle");
});

test("vault timing probes exist for store and retrieve (wallNanos only)", () => {
  const cell = makeTestCell();
  cell.vault.store("u1", "anthropic", TEST_KEYS.anthropic);
  cell.vault.retrieve("u1", "u1", "anthropic");
  const stages = payloadsOf(cell, "vault.timing").map((t) => t.stage);
  assert.deepEqual(stages, ["store.encrypt", "retrieve.decrypt"]);
});
