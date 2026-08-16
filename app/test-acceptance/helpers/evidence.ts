/**
 * SUB200 restructure (wave 2) — per-suite evidence PARTS for run_demo.py.
 *
 * The original single-file suite accumulated one `evidence` record across its
 * tests and wrote acceptance/evidence/headless.json in afterAll. The split
 * suites each write their own PART file (headless-parts/<name>.json, whatever
 * accumulated — exactly the old partial-on-failure semantics, per file); the
 * vitest globalSetup teardown (helpers/globalSetup.ts) merges the parts into
 * the SAME headless.json shape run_demo.py has always read. Stale-evidence
 * honesty is preserved by the globalSetup SETUP phase deleting headless.json
 * + all parts before any test runs.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll } from "vitest";
import path from "node:path";

import { PARTS_DIR } from "./analyses";

/** Registers an afterAll that writes this suite's accumulated evidence keys
 *  as one part file (call at test-file top level with a mutable record). */
export function registerEvidencePart(partName: string, evidence: Record<string, unknown>): void {
  afterAll(() => {
    mkdirSync(PARTS_DIR, { recursive: true });
    writeFileSync(
      path.join(PARTS_DIR, `${partName}.json`),
      JSON.stringify(evidence, null, 2), "utf8");
  });
}
