/**
 * SUB200 restructure (wave 2) — vitest globalSetup for the §7 acceptance
 * headless suites (wired in vitest.acceptance.config.ts).
 *
 * SETUP (before any test): deletes acceptance/evidence/headless.json and all
 * headless-parts/*.json — stale evidence can never masquerade as this run's
 * (the original single file overwrote headless.json wholesale, so staleness
 * was impossible; this preserves that honesty for the split suites).
 *
 * TEARDOWN (after ALL suites, pass or fail): merges whatever part files the
 * suites wrote into the SAME headless.json shape run_demo.py has always read
 * (top-level generatedBy/coreUri/ids + the per-check section keys). A suite
 * that crashed before writing its part simply contributes no keys — run_demo's
 * named checks then FAIL on the missing evidence, exactly as before.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CORE_URI, EVIDENCE_DIR, EVIDENCE_PATH, MAIN, PARTS_DIR, SIDE, UNUSED } from "./analyses";

export default function setup(): () => void {
  rmSync(EVIDENCE_PATH, { force: true });
  rmSync(PARTS_DIR, { recursive: true, force: true });

  return () => {
    const evidence: Record<string, unknown> = {
      generatedBy: "app/test-acceptance/*.test.tsx (merged from evidence/headless-parts by helpers/globalSetup.ts)",
      coreUri: CORE_URI,
      ids: { main: MAIN, sideCalc: SIDE, unused: UNUSED },
    };
    if (existsSync(PARTS_DIR)) {
      for (const f of readdirSync(PARTS_DIR).sort()) {
        if (!f.endsWith(".json")) continue;
        Object.assign(evidence, JSON.parse(readFileSync(path.join(PARTS_DIR, f), "utf8")));
      }
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
  };
}
