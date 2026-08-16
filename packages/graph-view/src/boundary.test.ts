/**
 * Gate 1 — the import-boundary gate. WIRED FIRST (Operating Contract rule 3):
 * separation is a testable property. This cell may import ONLY the §7.6 allow-list.
 * Reaching Tree 3's producer, Tree 4's editor internals, any AI, or any network
 * client fails the build.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));

/* File census (Phase-1, LOGGED): src/wall.ts (the cell's wall — graph-view-wall/1.0.0)
 * and src/wall.conformance.test.tsx (pins-vs-face conformance) joined the census.
 * The gate scans readdirSync(srcDir), so both are swept by the same allow-list:
 * no new runtime deps, no banned import classes — wall.ts reaches only intra-cell
 * files + the canonical ../../schema/gen/* (the allowed relative-import class from
 * the Phase-0 swap). Extension is additive; no rule below was weakened. */

/** §7.6: renderer, react, ONE-of layout engines (both installed here because gate 13
 *  cross-checks them — a deliberate, logged exception), schema types (Phase-0
 *  assembly: re-exported from the canonical ../../schema/gen/* package via the
 *  relative-import allowance below), bus interface (local stub), the probe bus.
 *  All local files count as the cell. */
const PRODUCTION_ALLOW = [
  /^react$/,
  /^react\/jsx-runtime$/,
  /^react-dom$/,
  /^@xyflow\/react(\/.*)?$/, // includes dist/style.css
  /^elkjs(\/.*)?$/,
  /^@dagrejs\/dagre(\/.*)?$/,
  /^\.\.?\//, // intra-cell relative imports + the canonical schema package (../../schema/gen/*)
];

/** Test files may additionally reach the test runner, testing-library, and node
 *  builtins for fixture loading — never Tree 3/4 internals, AI, or network.
 *  node:crypto (Phase-0 extension, logged in ASSEMBLY-CHANGES.md): the schema-pin
 *  sync test hashes packages/schema/schema.json to enforce checkPin — tests only. */
const TEST_EXTRA_ALLOW = [
  /^vitest(\/.*)?$/,
  /^@testing-library\/react$/,
  /^react-dom\/client$/,
  /^node:(fs|path|url|crypto)$/,
];

const FORBIDDEN_SMELLS = [
  /tree1|tree3|tree4|monaco|codemirror|axios|node-fetch|openai|anthropic|@ai-sdk/i,
];

function importsOf(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /import\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /import\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // Re-exports resolve and bundle a module exactly like an import.
    /export\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
  ];
  for (const p of patterns) {
    for (const m of source.matchAll(p)) specs.push(m[1]);
  }
  return specs;
}

/** A computed dynamic import can't be allow-listed statically — treat as a violation. */
const NON_LITERAL_DYNAMIC_IMPORT = /import\s*\(\s*(?!['"])[^)]/;

describe("gate 1 — import boundary (§7.6 allow-list)", () => {
  const files = readdirSync(srcDir).filter((f) => /\.(ts|tsx)$/.test(f));

  it("finds the cell's source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const isTest = /\.test\.(ts|tsx)$/.test(file) || file === "testUtil.ts";
    it(`${file} imports only its declared dependencies`, () => {
      const source = readFileSync(join(srcDir, file), "utf8");
      const allow = isTest ? [...PRODUCTION_ALLOW, ...TEST_EXTRA_ALLOW] : PRODUCTION_ALLOW;
      for (const spec of importsOf(source)) {
        const ok = allow.some((re) => re.test(spec));
        expect(ok, `${file} imports "${spec}" which is outside the §7.6 allow-list`).toBe(true);
        for (const smell of FORBIDDEN_SMELLS) {
          expect(smell.test(spec), `${file} imports "${spec}" — forbidden dependency class`).toBe(false);
        }
      }
      // A dynamic import the scanner cannot read is a boundary violation, not a skip.
      expect(
        NON_LITERAL_DYNAMIC_IMPORT.test(source),
        `${file} contains a non-literal dynamic import — unanalyzable by the boundary gate`,
      ).toBe(false);
    });
  }

  it("package.json runtime deps are exactly the declared stack (license gate)", () => {
    const pkg = JSON.parse(readFileSync(join(srcDir, "..", "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies).sort();
    // React Flow (MIT), react/react-dom (MIT), elkjs (EPL-2.0 — file-level copyleft,
    // safe to ship as a called dependency), @dagrejs/dagre (MIT fallback).
    expect(deps).toEqual(["@dagrejs/dagre", "@xyflow/react", "elkjs", "react", "react-dom"]);
  });
});
