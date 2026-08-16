/**
 * §7 ACCEPTANCE — the headless organism checks, §7(h) (SUB200 wave-2 split of
 * acceptance.headless.test.tsx; shared inputs/mounts hoisted VERBATIM to
 * test-acceptance/helpers/*; evidence PART merged into
 * acceptance/evidence/headless.json by helpers/globalSetup.ts).
 *
 * Proven HERE, on the cells' OWN pins:
 *  (h, ceiling) unknown-tier honesty through the view layer: the CEILING
 *      (typst) analysis renders unknown EVERYWHERE on the view wall's
 *      dump().paints — hatched grey fills, unknown rings, zero green paints,
 *      and every connection is a DASHED LEAD (render.edge.leadGuard fired
 *      once per lead, zero resolved edges).  Green-flow round: this story
 *      moved from the lean analysis (which EARNED CT greens) to typst.
 */

import { describe, test, expect, beforeAll } from "vitest";

import { installReactFlowShims } from "../test/helpers/reactFlowShims";
import { ceilingExpect, ceilingEnvelope } from "./helpers/analyses";
import {
  registerMountTeardown, openGraphOnly, of, lastPayload, type AnyEvent,
} from "./helpers/mounts";
import { registerEvidencePart } from "./helpers/evidence";
import { createJoinedBus } from "../src/busAdapter";
import { createGraphViewWall } from "@graph-view/src/wall";
import { COLORS } from "@graph-view/src/verdict";

beforeAll(installReactFlowShims);
registerMountTeardown();

const evidence: Record<string, unknown> = {};
registerEvidencePart("ceiling", evidence);

// ─────────────────────────────────────────────────────────────────────────────

describe("§7(h) unknown-tier honesty — the CEILING (typst) analysis through the view layer", () => {
  test("every paint unknown (hatched grey fills, unknown rings, ZERO green), every connection a dashed lead", async () => {
    const bus = createJoinedBus();
    const wall = await createGraphViewWall(ceilingEnvelope(), bus.graphSide);
    openGraphOnly.push(wall);

    const leanNodes = ceilingExpect.graph.nodes as any[];
    const leanLeads = ceilingExpect.graph.leads as any[];
    expect(leanNodes.length).toBeGreaterThan(0);
    expect((ceilingExpect.graph.edges as any[]).length).toBe(0);
    expect(leanLeads.length).toBeGreaterThan(0);

    const paints = (wall.pins.dump() as any).paints as Record<string, {
      fillStatus: string; fillColor: string; fillHatched: boolean;
      outlineStatus: string; outlineColor: string; outlineWasNull: boolean;
    }>;
    const paintStatuses = new Set<string>();
    for (const n of leanNodes) {
      const p = paints[n.id];
      expect(p, `paint for ${n.id}`).toBeTruthy();
      expect(p.fillStatus).toBe("unknown");
      expect(p.fillHatched).toBe(true);
      expect(p.fillColor).not.toBe(COLORS.green);
      expect(p.outlineStatus).toBe("unknown");
      expect(p.outlineWasNull).toBe(false);
      expect(p.outlineColor).toBe(COLORS.unknown);
      expect(p.outlineColor).not.toBe(COLORS.green);
      paintStatuses.add(p.fillStatus);
      paintStatuses.add(p.outlineStatus);
    }
    expect([...paintStatuses]).toEqual(["unknown"]); // LITERALLY nothing else

    // every connection renders as a DASHED LEAD (leadEdge), never a resolved
    // edge — one render.edge.leadGuard per lead, count EXACT.
    const hist = wall.pins.history() as AnyEvent[];
    const leadGuards = of(hist, "render.edge.leadGuard");
    expect(leadGuards.length).toBe(leanLeads.length);
    const face = lastPayload<{ nodes: number; edges: number; leads: number }>(hist, "wall.face.result");
    // the cell's OWN honest behavior: an unresolved lead target renders as a
    // synthesized GHOST PLACEHOLDER node, painted unknown — never green
    // (graph-view src/apply.ts placeholderPaint). Census = served + ghosts.
    const ghostIds = [...new Set(
      leanLeads.map((l: any) => String(l.dstId))
        .filter((d: string) => d.startsWith("unresolved:")))];
    expect(face.nodes).toBe(leanNodes.length + ghostIds.length);
    expect(face.leads).toBe(leanLeads.length);
    expect(face.edges).toBe(leanLeads.length); // rendered edge universe == leads only (0 resolved)
    // ghost paints (when surfaced on the dump) must also be unknown/never green
    for (const gid of ghostIds) {
      const gp = (paints as Record<string, any>)[gid];
      if (gp) {
        expect(gp.fillStatus).toBe("unknown");
        expect(gp.fillColor).not.toBe(COLORS.green);
        expect(gp.outlineColor).not.toBe(COLORS.green);
      }
    }

    evidence.h_ceiling_view = {
      nodes: leanNodes.length,
      leads: leanLeads.length,
      resolvedEdges: (ceilingExpect.graph.edges as any[]).length,
      ghostPlaceholders: ghostIds,
      paints,
      paintStatuses: [...paintStatuses],
      leadGuardCount: leadGuards.length,
      faceResult: face,
      colorsUnknown: COLORS.unknown,
      colorsGreen: COLORS.green,
    };
  });
});
