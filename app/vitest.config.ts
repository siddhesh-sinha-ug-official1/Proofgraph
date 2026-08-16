/**
 * V5 vessel test config. Cross-package imports are the SANCTIONED pattern:
 * this app imports cell sources from OUTSIDE each cell (graph-view's boundary
 * gate scans only its own src/; editor-shell's import gate likewise), reached
 * via the aliases below + relative paths inside src/busAdapter.ts.
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
    // ONE React instance: cell sources executed from outside the cells must
    // resolve react/react-dom to the app's copy (same pinned 18.3.1), or the
    // hooks dispatcher splits across two react instances at render time.
    dedupe: ["react", "react-dom", "@xyflow/react"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
  },
});
