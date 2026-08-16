/**
 * §7 ACCEPTANCE — the headless organism checks, §7(i) (SUB200 wave-2 split of
 * acceptance.headless.test.tsx; shared inputs/mounts hoisted VERBATIM to
 * test-acceptance/helpers/*; evidence PART merged into
 * acceptance/evidence/headless.json by helpers/globalSetup.ts).
 *
 * Proven HERE, on the cells' OWN pins:
 *  (i, lean) THE GREEN FLOW, headless: the lean CT analysis paints the
 *      kernel-verified decls GREEN on the view wall's dump().paints
 *      (canonical #2E7D32 — the cell's own COLORS.green, asserted via pins,
 *      not pixels) and the resolved proof_uses edge renders as a REAL edge
 *      (zero leadGuards).  The editor wall, mounted at the tier the analysis
 *      MEASURED (capability.lean.measuredTierPin == CT — never asserted
 *      locally), lets the green through its own guard
 *      (editor.verdict.green.guard greenAllowed:true) and paints the
 *      pg-fill-green gutter glyph — evidence (ids + UTF-8 byte arrays) is
 *      written for run_demo.py check (i)'s trace.
 */

import { describe, test, expect, beforeAll } from "vitest";

import { installReactFlowShims } from "../test/helpers/reactFlowShims";
import {
  LEAN_MEASURED_TIER, idOf, leanEnvelope, leanExpect, leanServe, leanEditorNodes,
} from "./helpers/analyses";
import {
  mountLeanEditor, registerMountTeardown, openGraphOnly, of, utf8, lastPayload,
  type AnyEvent,
} from "./helpers/mounts";
import { registerEvidencePart } from "./helpers/evidence";
import { createJoinedBus } from "../src/busAdapter";
import { createGraphViewWall } from "@graph-view/src/wall";
import { COLORS } from "@graph-view/src/verdict";

beforeAll(installReactFlowShims);
registerMountTeardown();

const evidence: Record<string, unknown> = {};
registerEvidencePart("greenflow", evidence);

// ─────────────────────────────────────────────────────────────────────────────

describe("§7(i) THE GREEN FLOW — the lean CT analysis through view paints and the editor gutter", () => {
  test("kernel-verified decls paint #2E7D32 on the view wall; the editor guard PASSES at measured CT and paints the green gutter glyph", async () => {
    // The tier is MEASURED (cell 2's pin, carried by the outer wall) — the
    // mount refuses to claim CT the analysis did not measure.
    expect(LEAN_MEASURED_TIER).toBe("CT");

    const GREEN = idOf(leanExpect, "unused_hyp.uses_base");   // src of the resolved edge
    const BASE = idOf(leanExpect, "unused_hyp.base_fact");
    const MODULE = idOf(leanExpect, "unused_hyp");

    // ── view layer: the cell's OWN paints (dump().paints), never pixels ────
    const bus = createJoinedBus();
    const wall = await createGraphViewWall(leanEnvelope(), bus.graphSide);
    openGraphOnly.push(wall);

    const paints = (wall.pins.dump() as any).paints as Record<string, {
      fillStatus: string; fillColor: string; fillHatched: boolean;
      outlineStatus: string; outlineColor: string; outlineWasNull: boolean;
    }>;
    for (const nid of [GREEN, BASE]) {
      const p = paints[nid];
      expect(p, `paint for ${nid}`).toBeTruthy();
      expect(p.fillStatus).toBe("green");
      expect(p.fillColor).toBe("#2E7D32");            // the canonical green, literally
      expect(p.fillColor).toBe(COLORS.green);          // == the cell's own constant
      expect(p.fillHatched).toBe(false);
      expect(p.outlineStatus).toBe("green");           // ruling-8 green ring (lemma base)
      expect(p.outlineWasNull).toBe(false);
    }
    // the module is NOT kernel-judged: unknown, hatched, never green
    expect(paints[MODULE].fillStatus).toBe("unknown");
    expect(paints[MODULE].fillHatched).toBe(true);
    expect(paints[MODULE].fillColor).not.toBe(COLORS.green);

    // the resolved proof_uses edge renders as a REAL edge: zero leadGuards
    const hist = wall.pins.history() as AnyEvent[];
    expect(of(hist, "render.edge.leadGuard").length).toBe(0);
    const face = lastPayload<{ nodes: number; edges: number; leads: number }>(hist, "wall.face.result");
    expect(face.edges).toBe(1);
    expect(face.leads).toBe(0);

    // view ingest pin carries the id byte-identical (independent parses)
    const ingestHits = of(hist, "ingest.node").filter((e) => (e.payload as { id?: string }).id === GREEN);
    expect(ingestHits.length).toBe(1);

    // ── editor layer: cell 4's guard + the gutter pin ──────────────────────
    const { editorWall } = await mountLeanEditor(leanEditorNodes(leanServe));
    const edHist = editorWall.pins.history() as AnyEvent[];

    const guards = of(edHist, "editor.verdict.green.guard")
      .filter((e) => (e.payload as { nodeId?: string }).nodeId === GREEN);
    expect(guards.length).toBeGreaterThan(0);
    const guard = guards[guards.length - 1].payload as {
      nodeId: string; wouldBeGreen: boolean; greenAllowed: boolean; tier: string; source: string; reason: string;
    };
    expect(guard.wouldBeGreen).toBe(true);
    expect(guard.greenAllowed).toBe(true);             // THE guard passes — attested CT green
    expect(guard.tier).toBe("CT");
    expect(guard.source.startsWith("lean-kernel:")).toBe(true);

    const gutterPaints = of(edHist, "editor.verdict.gutter.paint")
      .filter((e) => (e.payload as { nodeId?: string }).nodeId === GREEN);
    expect(gutterPaints.length).toBeGreaterThan(0);
    const gutter = gutterPaints[gutterPaints.length - 1].payload as {
      nodeId: string; glyphClass: string; status: string; lineNumber: number;
    };
    expect(gutter.glyphClass).toBe("pg-fill-green");
    expect(gutter.status).toBe("green");
    // no green.blocked fired for this node (the guard PERMITTED, not blocked)
    expect(of(edHist, "editor.verdict.green.blocked")
      .filter((e) => (e.payload as { nodeId?: string }).nodeId === GREEN).length).toBe(0);

    evidence.i_hops = {
      nodeId: GREEN,
      nodeIdUtf8: utf8(GREEN),
      name: "unused_hyp.uses_base",
      measuredTier: LEAN_MEASURED_TIER,
      viewGreenPaint: {
        cell: "graph-view",
        via: "pins.dump().paints (the cell's own paints — not pixels)",
        id: GREEN,
        idUtf8: utf8(GREEN),
        fillStatus: paints[GREEN].fillStatus,
        fillColor: paints[GREEN].fillColor,
        outlineStatus: paints[GREEN].outlineStatus,
        canonicalGreen: "#2E7D32",
        byteIdentical: (of(hist, "ingest.node")
          .find((e) => (e.payload as { id?: string }).id === GREEN)!.payload as { id: string }).id === GREEN
          && paints[GREEN].fillColor === "#2E7D32",
      },
      editorGutter: {
        cell: "editor-shell",
        probeId: "editor.verdict.gutter.paint",
        id: gutter.nodeId,
        idUtf8: utf8(gutter.nodeId),
        glyphClass: gutter.glyphClass,
        lineNumber: gutter.lineNumber,
        guard: { greenAllowed: guard.greenAllowed, tier: guard.tier, source: guard.source, reason: guard.reason },
        byteIdentical: gutter.nodeId === GREEN,
      },
      resolvedEdgeRendered: { edges: face.edges, leads: face.leads, leadGuards: 0 },
    };
  });
});
