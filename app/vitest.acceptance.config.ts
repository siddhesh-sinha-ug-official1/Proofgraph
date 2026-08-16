/**
 * §7 acceptance headless config (Phase 3, assembly code).
 *
 * Identical resolution rules to vitest.config.ts (the sanctioned cross-package
 * import pattern + single-React dedupe) but includes ONLY the acceptance
 * headless suite in test-acceptance/. Driven by acceptance/run_demo.py, which
 * writes acceptance/analysis-*.json FIRST — the suite refuses loudly if the
 * analyses are missing (never fakes green on absent inputs).
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@editor-shell": p("../packages/editor-shell"),
      "@graph-view": p("../packages/graph-view"),
      "@schema": p("../packages/schema"),
    },
    dedupe: ["react", "react-dom", "@xyflow/react"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["test-acceptance/**/*.test.{ts,tsx}"],
    // SUB200 restructure (wave 2): the split suites write per-file evidence
    // PARTS; globalSetup clears stale evidence up front and merges the parts
    // into the SAME acceptance/evidence/headless.json shape run_demo.py reads.
    globalSetup: ["test-acceptance/helpers/globalSetup.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
