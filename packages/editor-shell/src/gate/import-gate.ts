/**
 * S9 — Import-boundary gate (Operating Contract rule 3: separation is a
 * testable property). Pure logic over a scanned file list so tests can feed
 * synthetic violations; scripts/import-gate.mjs runs it against the real tree.
 *
 * Two checks:
 * 1. Allow-list: src/ may import only relative paths + declared deps.
 * 2. Monaco leak: Monaco-only packages imported anywhere but src/mount/monaco/
 *    (would break the CodeMirror-6 swap — §7.8 editor-agnostic core).
 */

import type { ProbeBus } from "../probe/probe-bus.js";

/**
 * Declared dependency allow-list (§6 S9). react/react-dom added as peers of
 * @typefox/monaco-editor-react — declared VISIBLY here, logged by the scan
 * (transcript D7), not smuggled.
 */
export const DECLARED_DEPS: string[] = [
  "monaco-editor",
  "monaco-languageclient",
  "vscode-ws-jsonrpc",
  "@codingame/monaco-vscode-api",
  "@typefox/monaco-editor-react",
  "web-tree-sitter",
  "monaco-tree-sitter",
  "react",
  "react-dom",
];

/** Packages whose types must never escape src/mount/monaco/. */
export const MONACO_ONLY_PACKAGES: string[] = [
  "monaco-editor",
  "@codingame/monaco-vscode-api",
  "@typefox/monaco-editor-react",
  "monaco-tree-sitter",
];

export interface ScannedFile {
  /** Path relative to the cell root, forward slashes (e.g. "src/lsp/pump.ts"). */
  path: string;
  imports: string[];
}

export interface GateViolation {
  offendingImport: string;
  fromFile: string;
  reason: "outside-allowlist";
}

export interface MonacoLeak {
  fromModule: string;
  importedType: string;
  reason: "monaco-type-outside-mount";
}

export interface GateResult {
  pass: boolean;
  violations: GateViolation[];
  leaks: MonacoLeak[];
  actualImports: string[];
}

function packageOf(spec: string): string {
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/");
    return name ? `${scope}/${name}` : spec;
  }
  return spec.split("/")[0];
}

function isRelative(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

export function runImportGate(probe: ProbeBus, files: ScannedFile[]): GateResult {
  const violations: GateViolation[] = [];
  const leaks: MonacoLeak[] = [];
  const externals = new Set<string>();

  for (const f of files) {
    const path = f.path.replace(/\\/g, "/");
    const inMonacoMount = path.startsWith("src/mount/monaco/");
    for (const spec of f.imports) {
      if (isRelative(spec)) continue;
      const pkg = packageOf(spec);
      externals.add(pkg);
      if (!DECLARED_DEPS.includes(pkg)) {
        violations.push({ offendingImport: spec, fromFile: path, reason: "outside-allowlist" });
      }
      if (MONACO_ONLY_PACKAGES.includes(pkg) && !inMonacoMount) {
        leaks.push({ fromModule: path, importedType: spec, reason: "monaco-type-outside-mount" });
      }
    }
  }

  const scanProbe = probe.emit(
    "editor.gate.import.scan",
    {
      declaredDeps: [...DECLARED_DEPS],
      actualImports: [...externals].sort(),
      fileCount: files.length,
    },
    null,
  );
  const scanRef = probe.ref(scanProbe);
  for (const v of violations) {
    probe.emit("editor.gate.import.violation", { ...v }, scanRef);
  }
  for (const l of leaks) {
    probe.emit("editor.gate.monaco.leak", { ...l }, scanRef);
  }

  return {
    pass: violations.length === 0 && leaks.length === 0,
    violations,
    leaks,
    actualImports: [...externals].sort(),
  };
}

/** Extract import specifiers from TypeScript source (static + dynamic + re-export). */
export function extractImports(source: string): string[] {
  const specs: string[] = [];
  const re =
    /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) specs.push(spec);
  }
  return specs;
}
