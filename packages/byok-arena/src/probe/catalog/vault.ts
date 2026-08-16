// Catalog section — §6.A Key Vault leads. Assembled (in this exact order) by
// ../catalog.ts; the catalog is element-for-element what it always was.

import type { CatalogEntry } from "../bus.ts";
import { e } from "./entry.ts";

export function vaultEntries(): CatalogEntry[] {
  return [
    e("vault.storageMode", "decision", "{chosen,alt,reason,branchNotTaken}",
      "[addition] §5.6 vault storage-mode decision: server-side-encrypted vs client-side-only, with the branch not taken"),
    e("vault.store.input", "input", "{userId,provider,key:RedactedKey}",
      "a key was submitted for a user+provider; plaintext never present"),
    e("vault.store.encrypt", "value", "{userId,provider,cipherLen,keyRef,kmsMode}",
      "the key was encrypted at rest (ciphertext only); kmsMode names the envelope/per-user scheme"),
    e("vault.store.output", "output", "{stored,keyRef}",
      "storage succeeded, returns a handle not a key"),
    e("vault.retrieve.input", "input", "{authUserId,userId,provider}",
      "who is asking for whose key"),
    e("vault.retrieve.scopeCheck", "decision", "{allow,reason,branchNotTaken}",
      "per-user isolation: allow only if authUserId==userId; deny reason on cross-user read"),
    e("vault.retrieve.scopeViolation", "branch", "{authUserId,requestedUserId,provider,denied}",
      "a session tried to read another user's key — the security branch"),
    e("vault.retrieve.miss", "branch", "{userId,provider,found}",
      "[addition] retrieve for a user+provider with no stored record — the not-found branch"),
    e("vault.retrieve.decrypt", "value", "{userId,provider,key:RedactedKey,ok}",
      "decryption happened in-memory; only presence+last4 shown"),
    e("vault.redact.boundary", "value", "{site,provider,key:RedactedKey}",
      "the single chokepoint every key passes through before any probe/log/error"),
    e("vault.revoke", "state", "{userId,provider,action}",
      "user exercised the revoke/rotate control (delete or replace)"),
    e("vault.timing", "timing", "{stage,wallNanos}",
      "encrypt/decrypt cost (wallNanos only — never used for ordering)"),
  ];
}
