/**
 * §7 ACCEPTANCE — the headless organism checks, §7(j) (SUB200 wave-2 split of
 * acceptance.headless.test.tsx; shared inputs/mounts hoisted VERBATIM to
 * test-acceptance/helpers/*; evidence PART merged into
 * acceptance/evidence/headless.json by helpers/globalSetup.ts).
 *
 * Proven HERE, on the cells' OWN pins:
 *  (j, lean) the COMPANION GUARD, headless editor layer: a DOCTORED green
 *      (same node, checker evidence stripped) is BLOCKED by cell 4's guard
 *      (editor.verdict.green.blocked, reason green-may-never-be-faked) and
 *      never reaches a green glyph — evidence for run_demo.py check (j).
 */

import { describe, test, expect, beforeAll } from "vitest";

import { installReactFlowShims } from "../test/helpers/reactFlowShims";
import { idOf, leanExpect, leanServe, leanEditorNodes } from "./helpers/analyses";
import { mountLeanEditor, registerMountTeardown, of, utf8, type AnyEvent } from "./helpers/mounts";
import { registerEvidencePart } from "./helpers/evidence";

beforeAll(installReactFlowShims);
registerMountTeardown();

const evidence: Record<string, unknown> = {};
registerEvidencePart("doctored", evidence);

// ─────────────────────────────────────────────────────────────────────────────

describe("§7(j) the companion guard — a DOCTORED green is blocked at the editor wall", () => {
  test("same node, checker evidence stripped → editor.verdict.green.blocked, no green glyph", async () => {
    const BASE = idOf(leanExpect, "unused_hyp.base_fact");
    const doctored = leanEditorNodes(leanServe).map((n) =>
      n.id === BASE
        ? { ...n, fill: { status: "green" as const, source: "" } }   // evidence stripped
        : n);

    const { editorWall } = await mountLeanEditor(doctored);
    const edHist = editorWall.pins.history() as AnyEvent[];

    const guards = of(edHist, "editor.verdict.green.guard")
      .filter((e) => (e.payload as { nodeId?: string }).nodeId === BASE);
    expect(guards.length).toBeGreaterThan(0);
    const guard = guards[guards.length - 1].payload as {
      wouldBeGreen: boolean; greenAllowed: boolean; reason: string;
    };
    expect(guard.wouldBeGreen).toBe(true);
    expect(guard.greenAllowed).toBe(false);            // blocked: no real verdict source

    const blocked = of(edHist, "editor.verdict.green.blocked")
      .filter((e) => (e.payload as { nodeId?: string }).nodeId === BASE);
    expect(blocked.length).toBeGreaterThan(0);
    const blockedPayload = blocked[blocked.length - 1].payload as {
      nodeId: string; downgradedTo: string; reason: string;
    };
    expect(blockedPayload.reason).toBe("green-may-never-be-faked");
    expect(blockedPayload.downgradedTo).not.toBe("green");

    // the gutter NEVER paints green for the doctored node
    const gutterGreens = of(edHist, "editor.verdict.gutter.paint")
      .filter((e) => {
        const p = e.payload as { nodeId?: string; glyphClass?: string };
        return p.nodeId === BASE && p.glyphClass === "pg-fill-green";
      });
    expect(gutterGreens.length).toBe(0);

    evidence.j_editor_blocked = {
      nodeId: BASE,
      nodeIdUtf8: utf8(BASE),
      doctoring: "fill.status=green kept, fill.source stripped to '' (checker evidence removed)",
      guard,
      blocked: blockedPayload,
      greenGlyphCount: gutterGreens.length,
    };
  });
});
