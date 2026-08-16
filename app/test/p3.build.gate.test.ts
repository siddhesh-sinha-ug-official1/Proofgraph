/**
 * P3 — BUILD GATE: `npx vite build` must succeed, and the built browser
 * bundle must contain NO key-shaped material — automated grep of the dist
 * output, not an eyeball (the brief's bundle-secret-scan).
 *
 * Patterns proven ABSENT from every emitted asset:
 *   - the ai server's default masterSecret literal (read live from
 *     ai/server.ts source, so a rename there cannot silently rot this scan);
 *   - the FAKE transport api key literal (same live extraction);
 *   - cell 6's INSECURE dev masterSecret default;
 *   - the V6 suite's test-key prefix family ("sk-ant-api03") and the fake-key
 *     prefix family ("sk-fake").
 *
 * The scan reads BYTES of every dist file (js/css/html/map/wasm alike) — if a
 * secret can reach the browser at all, it is in one of these files.
 */

import { describe, test, expect } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROOFGRAPH = path.dirname(APP_ROOT);
const DIST = path.join(APP_ROOT, "dist");

function extractLiteral(source: string, constName: string): string {
  const m = source.match(new RegExp(`${constName}\\s*=\\s*\\n?\\s*"([^"]+)"`));
  if (!m) throw new Error(`could not extract ${constName} literal from ai/server.ts — the scan must not silently pass`);
  return m[1];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe("P3 build gate", () => {
  test("vite build succeeds and the bundle carries no key-shaped material", { timeout: 600000 }, () => {
    // ── the build itself is the first gate ─────────────────────────────────
    execSync("npx vite build", { cwd: APP_ROOT, stdio: "pipe", timeout: 570000 });

    expect(existsSync(path.join(DIST, "index.html"))).toBe(true);
    const files = walk(DIST);
    expect(files.length).toBeGreaterThan(1);

    // ── the secret patterns (live-extracted where they live) ───────────────
    const aiServerSrc = readFileSync(path.join(PROOFGRAPH, "ai", "server.ts"), "utf8");
    const masterSecret = extractLiteral(aiServerSrc, "AI_SERVER_DEFAULT_MASTER_SECRET");
    const fakeApiKey = extractLiteral(aiServerSrc, "FAKE_TRANSPORT_API_KEY");
    const patterns: Array<[string, string]> = [
      ["ai-server default masterSecret", masterSecret],
      ["FAKE transport api key", fakeApiKey],
      ["cell-6 insecure dev masterSecret", "byok-arena-dev-master-secret-CHANGE-ME"],
      ["anthropic test-key prefix (V6 fixtures)", "sk-" + "ant-api03"],
      ["fake-key prefix family", "sk-" + "fake"],
    ];
    // sanity: the patterns themselves are non-trivial
    expect(masterSecret.length).toBeGreaterThan(16);
    expect(fakeApiKey.startsWith("sk-")).toBe(true);

    // ── scan every emitted byte ─────────────────────────────────────────────
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "latin1"); // byte-transparent read
      for (const [label, pattern] of patterns) {
        if (text.includes(pattern)) {
          hits.push(`${path.relative(DIST, file)}: ${label}`);
        }
      }
    }
    expect(hits, `key-shaped material reached the browser bundle:\n${hits.join("\n")}`).toEqual([]);
  });
});
