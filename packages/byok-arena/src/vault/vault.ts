// ============================================================================
// Key Vault — per-user encrypted store (§5.1, §6.A, §7.6).
// The app holds no key of its own; each user pastes theirs, it bills them.
// Default mode this build (§5.6): server-side encrypted, key never returned to
// the client after entry, decrypted only in-memory per request.
// Scheme: per-user data key = HKDF(masterSecret, salt=userId) → AES-256-GCM.
// Ciphertext at rest; plaintext exists only in memory on retrieve().
// ============================================================================

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import type { ProbeBus } from "../probe/bus.ts";
import { emitRedactBoundary, redactKey } from "../probe/redact.ts";

interface VaultRecord {
  keyRef: string;
  iv: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
  cipherLen: number;
}

export class KeyVault {
  private bus: ProbeBus;
  private masterSecret: Buffer;
  private records: Map<string, VaultRecord>;

  constructor(bus: ProbeBus, masterSecret: Buffer | string) {
    this.bus = bus;
    this.masterSecret = typeof masterSecret === "string" ? Buffer.from(masterSecret, "utf8") : masterSecret;
    this.records = new Map();
    bus.emit("vault.storageMode", "vault", "decision", {
      chosen: "server-side-encrypted",
      alt: "client-side-only",
      reason: "enables background jobs + unified metering; key never returned to client after entry; decrypt in-memory per request; visible delete-my-key control (revoke)",
      branchNotTaken: "client-side-only — best privacy story but loses server-side features, hits CORS, exposes key to client-side XSS",
    });
  }

  private deriveUserKey(userId: string): Buffer {
    // per-user data key — one user's key material never decrypts another's record
    return Buffer.from(hkdfSync("sha256", this.masterSecret, Buffer.from(userId, "utf8"), Buffer.from("byok-arena-vault-v0", "utf8"), 32));
  }

  private recordId(userId: string, provider: string): string {
    return `${userId}:${provider}`;
  }

  store(userId: string, provider: string, apiKey: string): { stored: true; keyRef: string } {
    const t0 = this.bus.nowNanos();
    const red = emitRedactBoundary(this.bus, "vault.store", provider, apiKey);
    const inputEv = this.bus.emit("vault.store.input", "vault.store", "input",
      { userId, provider, key: red });
    const cause = this.bus.ref(inputEv);

    const id = this.recordId(userId, provider);
    if (this.records.has(id)) {
      // pasting over an existing key is a rotate — surfaced, never silent
      this.bus.emit("vault.revoke", "vault.store", "state", { userId, provider, action: "replace" }, cause);
    }

    const dataKey = this.deriveUserKey(userId);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(apiKey, "utf8")), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const keyRef = "kref_" + createHash("sha256").update(id).digest("hex").slice(0, 12);

    const encEv = this.bus.emit("vault.store.encrypt", "vault.store", "value",
      { userId, provider, cipherLen: ciphertext.length, keyRef, kmsMode: "perUser" }, cause);

    this.records.set(id, { keyRef, iv, ciphertext, authTag, cipherLen: ciphertext.length });

    this.bus.emit("vault.store.output", "vault.store", "output", { stored: true, keyRef }, this.bus.ref(encEv));
    this.bus.emit("vault.timing", "vault.store", "timing",
      { stage: "store.encrypt", wallNanos: Number(this.bus.nowNanos() - t0) }, cause);
    return { stored: true, keyRef };
  }

  /**
   * Per-user isolation enforced at EVERY read: allow only if the authenticated
   * user id matches the record's user id. Returns in-memory plaintext; the
   * plaintext never enters a probe/log/error (redactKey chokepoint).
   */
  retrieve(authUserId: string, userId: string, provider: string): string {
    const t0 = this.bus.nowNanos();
    const inputEv = this.bus.emit("vault.retrieve.input", "vault.retrieve", "input",
      { authUserId, userId, provider });
    const cause = this.bus.ref(inputEv);

    const allow = authUserId === userId;
    this.bus.emit("vault.retrieve.scopeCheck", "vault.retrieve", "decision", {
      allow,
      reason: allow ? "authUserId matches record userId" : "authUserId != recordUserId",
      branchNotTaken: allow
        ? "deny — would fire on any cross-user read"
        : "allow — requires authUserId === userId",
    }, cause);

    if (!allow) {
      this.bus.emit("vault.retrieve.scopeViolation", "vault.retrieve", "branch",
        { authUserId, requestedUserId: userId, provider, denied: true }, cause);
      const err = new Error(`vault: scope violation — session for "${authUserId}" may not read keys of "${userId}"`);
      this.bus.recordError(err);
      throw err;
    }

    const rec = this.records.get(this.recordId(userId, provider));
    if (!rec) {
      this.bus.emit("vault.retrieve.miss", "vault.retrieve", "branch",
        { userId, provider, found: false }, cause);
      const err = new Error(`vault: no key stored for user "${userId}" provider "${provider}"`);
      this.bus.recordError(err);
      throw err;
    }

    const dataKey = this.deriveUserKey(userId);
    let plaintext: string;
    try {
      const decipher = createDecipheriv("aes-256-gcm", dataKey, rec.iv);
      decipher.setAuthTag(rec.authTag);
      plaintext = Buffer.concat([decipher.update(rec.ciphertext), decipher.final()]).toString("utf8");
    } catch (err) {
      this.bus.emit("vault.retrieve.decrypt", "vault.retrieve", "value",
        { userId, provider, key: { present: false, last4: "", provider, keyLen: 0 }, ok: false }, cause);
      this.bus.recordError(err);
      throw new Error(`vault: decrypt failed for user "${userId}" provider "${provider}" (auth tag mismatch)`);
    }

    const red = redactKey(plaintext, provider);
    emitRedactBoundary(this.bus, "vault.retrieve", provider, plaintext, cause);
    this.bus.emit("vault.retrieve.decrypt", "vault.retrieve", "value",
      { userId, provider, key: red, ok: true }, cause);
    this.bus.emit("vault.timing", "vault.retrieve", "timing",
      { stage: "retrieve.decrypt", wallNanos: Number(this.bus.nowNanos() - t0) }, cause);
    return plaintext;
  }

  revoke(authUserId: string, userId: string, provider: string): void {
    if (authUserId !== userId) {
      this.bus.emit("vault.retrieve.scopeViolation", "vault.revoke", "branch",
        { authUserId, requestedUserId: userId, provider, denied: true });
      throw new Error(`vault: scope violation — session for "${authUserId}" may not revoke keys of "${userId}"`);
    }
    this.bus.emit("vault.revoke", "vault.revoke", "state", { userId, provider, action: "delete" });
    this.records.delete(this.recordId(userId, provider));
  }

  /** dump() view — ciphertext refs only (§11), never key material. */
  dumpState(): { records: { id: string; keyRef: string; cipherLen: number }[] } {
    return {
      records: [...this.records.entries()].map(([id, r]) => ({ id, keyRef: r.keyRef, cipherLen: r.cipherLen })),
    };
  }
}
