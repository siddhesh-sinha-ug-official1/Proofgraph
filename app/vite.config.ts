/**
 * P3 — the human face's vite config. Port 5199 is graph-view's pinned dev port
 * (OUTERWALL-CONTRACT "Dev ports"); strictPort so a squatting process is a loud
 * failure, never a silent port drift.
 *
 * Aliases mirror vitest.config.ts exactly (the sanctioned cross-package import
 * pattern: the app executes CELL SOURCES from outside each cell; both cells'
 * import gates scan only their own src/ and stay green).
 *
 * __MOAT_ABS_DIR__: the absolute on-disk path of the moatpkg acceptance
 * fixture, injected at build time so the editor pane can didOpen the REAL file
 * uri (pyright canonical form) — pyright then resolves the sibling helpers.py
 * from disk. This is machine-local by nature (a dev-server define, not data).
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [p("..")] }, // proofgraph root: cell sources + acceptance fixtures
  },
  resolve: {
    alias: {
      "@editor-shell": p("../packages/editor-shell"),
      "@graph-view": p("../packages/graph-view"),
      "@schema": p("../packages/schema"),
    },
    // ONE React instance across app + cell sources (same pinned 18.3.1).
    dedupe: ["react", "react-dom", "@xyflow/react"],
  },
  define: {
    __MOAT_ABS_DIR__: JSON.stringify(
      path.resolve(p(".."), "acceptance", "fixtures", "moatpkg").replace(/\\/g, "/"),
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // monaco is deliberately bundled whole (cell 4's own demo does the same);
    // record measured sizes, never trust circulated figures.
    chunkSizeWarningLimit: 6000,
  },
});
