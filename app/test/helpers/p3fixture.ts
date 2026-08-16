/**
 * SUB200 restructure (wave 2) — shared moat-shaped fixture for the p3.face.*
 * component suites, hoisted VERBATIM from p3.face.test.tsx (canonical
 * envelope + contract-shaped /analysis; Phase-3 brief).
 */

import type { AnalysisPayload, AnalysisVerdict } from "../../src/analysisSource";
import type { CanonicalEnvelope, HttpGet } from "../../src/graphSource";
import { worstOfVerdict } from "@schema/gen/graph-schema";

export const MOD_CORE = "n_c0c0c0c0c0c0c0c0";
export const FN_MAIN = "n_1a1a1a1a1a1a1a1a";
export const FN_SIDE = "n_2b2b2b2b2b2b2b2b";
export const MOD_HELP = "n_3c3c3c3c3c3c3c3c";
export const FN_USED = "n_4d4d4d4d4d4d4d4d";
export const FN_UNUSED = "n_5e5e5e5e5e5e5e5e";

function mkNode(id: string, kind: "module" | "function", name: string, file: string, byteStart: number) {
  return {
    id, kind, lang: "python", name,
    signature: kind === "function" ? `def ${name}()` : null,
    span: { file, byteStart, byteEnd: byteStart + 40 },
    fill: { status: "unknown", source: "" },
    outline: null,
    origin: "checked",
    provenance: { tier: "T1", extractor: "structure-extractor@p3-fixture", resolved: true },
  };
}

export function servedEnvelope(): CanonicalEnvelope {
  return {
    schemaVersion: "v0",
    nodes: [
      mkNode(MOD_CORE, "module", "moatpkg.core", "core.py", 0),
      mkNode(FN_MAIN, "function", "moatpkg.core.main", "core.py", 100),
      mkNode(FN_SIDE, "function", "moatpkg.core.side_calc", "core.py", 200),
      mkNode(MOD_HELP, "module", "moatpkg.helpers", "helpers.py", 0),
      mkNode(FN_USED, "function", "moatpkg.helpers.used_fn", "helpers.py", 80),
      mkNode(FN_UNUSED, "function", "moatpkg.helpers.unused_fn", "helpers.py", 160),
    ],
    edges: [{
      id: "e_6f6f6f6f6f6f6f6f", kind: "calls", srcId: FN_MAIN, dstId: FN_USED,
      resolved: true, resolver: "pyright",
      provenance: { tier: "T2", extractor: "structure-extractor@p3-fixture" },
    }],
    leads: [{
      id: "e_7a7a7a7a7a7a7a7a", kind: "calls", srcId: FN_SIDE, dstId: "unresolved:helpers.used_fn",
      resolved: false, resolver: "",
      provenance: { tier: "T1", extractor: "structure-extractor@p3-fixture" },
    }],
  } as unknown as CanonicalEnvelope;
}

/** Ruling-8-shaped verdicts: every declared outline status is EXACTLY the
 *  canonical worst-case derivation of its worstOf (asserted in the paints
 *  suite, so this fixture can never drift from the schema package silently). */
export function analysisVerdicts(): Record<string, AnalysisVerdict> {
  const outline = (worstOf: string[]) => ({ status: worstOfVerdict(worstOf).status, worstOf });
  return {
    [MOD_CORE]: { fill: { status: "unknown", source: "" }, outline: outline([]) },                    // none -> green ring
    [FN_MAIN]: { fill: { status: "green", source: "capability CT verdict" }, outline: outline(["lemma", "blue"]) }, // blue
    [FN_SIDE]: { fill: { status: "unknown", source: "" }, outline: outline(["red", "lemma"]) },       // red
    [MOD_HELP]: { fill: { status: "unknown", source: "" }, outline: outline(["amber", "definition"]) }, // amber
    [FN_USED]: { fill: { status: "green", source: "capability CT verdict" }, outline: outline(["green"]) }, // green
    // ruling 8 lead-capped node: status capped at unknown (unknown fills act on
    // STATUS only) — worstOf carries recognized tokens, status is the cap.
    [FN_UNUSED]: { fill: { status: "unknown", source: "" }, outline: { status: "unknown", worstOf: ["none"] } },
  };
}

export function contractAnalysis(): AnalysisPayload {
  const env = servedEnvelope();
  const verdicts = analysisVerdicts();
  return {
    graph: {
      ...env,
      nodes: env.nodes.map((n) => ({ ...n, ...verdicts[String(n.id)] })),
    } as CanonicalEnvelope,
    verdicts,
    provenance: { note: "component fixture per OUTERWALL-CONTRACT" },
    gapAnalysis: {
      unused: [FN_UNUSED],
      unreferenced: [],
      cycles: { sccs: [], condensation: {} },
      reachability: {},
      incompleteBases: { [FN_UNUSED]: ["e_7a7a7a7a7a7a7a7a"] },
      blindSpots: [],
      soundnessNote: "fixture",
    },
  };
}

export const httpGetOf = (routes: Record<string, { status: number; body: unknown }>): HttpGet =>
  async (url) => {
    const u = new URL(url);
    const r = routes[u.pathname];
    if (!r) throw new Error(`fixture transport: no route ${u.pathname}`);
    return { status: r.status, bytes: new TextEncoder().encode(JSON.stringify(r.body)) };
  };
