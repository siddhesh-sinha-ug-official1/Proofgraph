/**
 * §7 ACCEPTANCE — the headless organism checks that need BOTH TS walls
 * (driven by acceptance/run_demo.py; evidence written for the python runner).
 *
 * SUB200 restructure (wave 2): the original single-file suite split by its §7
 * describe-groups — THIS file (original path kept) carries §7(d) brushing +
 * the §7(f) trace hops + the §7(b) view-outline facts (all proven inside the
 * ONE original test); siblings: acceptance.ceiling.test.tsx §7(h),
 * acceptance.greenflow.test.tsx §7(i), acceptance.doctored.test.tsx §7(j).
 * Shared inputs/mounts hoisted VERBATIM to test-acceptance/helpers/*; each
 * suite writes its evidence PART and helpers/globalSetup.ts merges them into
 * the SAME acceptance/evidence/headless.json run_demo.py reads. No test
 * renamed, no assertion weakened.
 *
 * What is proven HERE, on the cells' OWN pins (never a return value alone):
 *  (d) brushing, headless bus-level: the V5 joined bus (app/src/busAdapter.ts,
 *      VERBATIM) + the REAL editor wall + the REAL graph-view wall, both
 *      mounted on the REAL moat analysis graph — one select each direction,
 *      byte-equal nodeIds asserted on BOTH cells' pins, exact bounded counts
 *      (no echo storm).
 *  (f) the two browser-tier hops of the system trace, headless: the graph
 *      wall's ingest.node pin (view-ingested) and the editor wall's busLog +
 *      recv pins (editor-selection) both carry moatpkg.core.main's Node.id
 *      byte-identical — evidence (incl. independent UTF-8 byte arrays) is
 *      written for run_demo.py to append to acceptance/TRACE-full.json.
 *  (b/h-view, moat) OUTLINE rings through the view: every moat node paints
 *      outlineStatus "unknown" from the FILLED (non-null) outline — grey,
 *      never green, outlineWasNull false (the analysis really filled it).
 */

import { describe, test, expect, beforeAll } from "vitest";

import { installReactFlowShims } from "../test/helpers/reactFlowShims";
import { moatExpect, moatEnvelope, MAIN, SIDE, caretInside } from "./helpers/analyses";
import {
  mountJoint, registerMountTeardown, of, lastPayload, utf8, type AnyEvent,
} from "./helpers/mounts";
import { registerEvidencePart } from "./helpers/evidence";
import { COLORS } from "@graph-view/src/verdict";

beforeAll(installReactFlowShims);
registerMountTeardown();

// evidence assembled by this suite; written as a part in afterAll for the
// globalSetup merger (→ acceptance/evidence/headless.json for run_demo.py).
const evidence: Record<string, unknown> = {};
registerEvidencePart("brushing", evidence);

// ─────────────────────────────────────────────────────────────────────────────

describe("§7(d) brushing — headless bus-level round-trip on the REAL moat analysis", () => {
  test("one select each direction: byte-equal nodeIds on BOTH cells' pins, exact bounded counts", async () => {
    const j = await mountJoint(moatEnvelope());

    // direction 1: editor caret in side_calc → graph wall
    const sideSpan = (moatExpect.graph.nodes as any[]).find((n) => n.id === SIDE).span;
    j.editorAdapter.moveCursor(caretInside(sideSpan.byteStart));

    const edHist1 = j.editorWall.pins.history() as AnyEvent[];
    const emitted = lastPayload<{ busEvent: { type: string; nodeId: string; origin: string } }>(
      edHist1, "editor.select.emit.bus");
    expect(emitted.busEvent.type).toBe("node.select");
    expect(emitted.busEvent.origin).toBe("editor");
    expect(emitted.busEvent.nodeId === SIDE).toBe(true); // byte-equal (independent parses)

    const gvHist1 = j.graphWall.pins.history() as AnyEvent[];
    const selIn = lastPayload<{ nodeId: string; source: string }>(gvHist1, "link.select.in");
    expect(selIn.nodeId === SIDE).toBe(true);
    expect(selIn.nodeId === emitted.busEvent.nodeId).toBe(true);
    expect(selIn.source).toBe("editor");
    expect(lastPayload<{ present: boolean }>(gvHist1, "link.select.resolve").present).toBe(true);
    expect((j.graphWall.pins.dump() as any).selection.selectedId === SIDE).toBe(true);

    // direction 2: graph click on main → editor wall
    j.graphWall.cell.controller.clickNode(MAIN);

    const gvHist2 = j.graphWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string }>(gvHist2, "link.select.out").nodeId === MAIN).toBe(true);
    const wire = lastPayload<{ type: string; nodeId: string; source: string }>(gvHist2, "link.bus.emit");
    expect(wire).toEqual({ type: "select", nodeId: MAIN, source: "graph" });

    const busLog = (j.editorWall.pins.dump() as { busLog: { type: string; nodeId: string; origin: string }[] }).busLog;
    const graphEvents = busLog.filter((e) => e.origin === "graph");
    expect(graphEvents.length).toBe(1);
    expect(graphEvents[0].type).toBe("node.select");
    expect(graphEvents[0].nodeId === MAIN).toBe(true); // byte-equal across the seam

    const edHist2 = j.editorWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string }>(edHist2, "editor.select.recv.bus").nodeId === MAIN).toBe(true);
    expect(lastPayload<{ found: boolean }>(edHist2, "editor.select.recv.lookup").found).toBe(true);
    const reveal = lastPayload<{ nodeId: string; highlightApplied: boolean; monacoRange?: unknown }>(
      edHist2, "editor.select.recv.reveal");
    expect(reveal.nodeId === MAIN).toBe(true);
    expect(reveal.highlightApplied).toBe(true);
    expect(of(edHist2, "editor.select.recv.miss").length).toBe(0);
    expect(j.editorAdapter.revealed.length).toBe(1);

    // NO ECHO STORM — exact counts (V5 discipline), never >=.
    expect(j.joined.editorSide.log.length).toBe(2);
    expect(j.joined.editorSide.log.map((e) => e.origin)).toEqual(["editor", "graph"]);
    expect(j.joined.graphSide.emitted.length).toBe(1);
    const s = j.joined.stats();
    expect(s.forwardedEditorToGraph).toBe(1);
    expect(s.forwardedGraphToEditor).toBe(1);
    expect(s.dropped).toBe(0);
    expect(of(edHist2, "editor.select.emit.bus").length).toBe(1);
    expect(of(edHist2, "editor.select.recv.bus").length).toBe(1);
    expect(of(gvHist2, "link.select.in").length).toBe(1);
    expect(of(gvHist2, "link.select.out").length).toBe(1);
    expect(of(gvHist2, "link.echo.ignored").length).toBe(1);
    expect(of(gvHist2, "link.select.unknownId").length).toBe(0);

    evidence.d_brushing = {
      editorToGraph: {
        caret: caretInside(sideSpan.byteStart),
        editorEmitNodeId: emitted.busEvent.nodeId,
        editorEmitNodeIdUtf8: utf8(emitted.busEvent.nodeId),
        gvSelectInNodeId: selIn.nodeId,
        gvSelectInNodeIdUtf8: utf8(selIn.nodeId),
        expectedId: SIDE,
        byteEqual: emitted.busEvent.nodeId === SIDE && selIn.nodeId === SIDE,
      },
      graphToEditor: {
        gvSelectOutNodeId: wire.nodeId,
        gvSelectOutNodeIdUtf8: utf8(wire.nodeId),
        editorBusLogEntry: graphEvents[0],
        editorBusLogNodeIdUtf8: utf8(graphEvents[0].nodeId),
        revealPayload: reveal,
        expectedId: MAIN,
        byteEqual: wire.nodeId === MAIN && graphEvents[0].nodeId === MAIN && reveal.nodeId === MAIN,
      },
      counts: {
        editorSideLog: j.joined.editorSide.log.length,
        graphSideEmitted: j.joined.graphSide.emitted.length,
        dropped: s.dropped,
      },
    };

    // §7(f) — the two browser-tier hops of the system trace, from the SAME
    // real interaction above (pins read fresh, byte arrays independent):
    const ingestHits = of(gvHist2, "ingest.node")
      .filter((e) => (e.payload as { id?: string }).id === MAIN);
    expect(ingestHits.length).toBe(1);
    evidence.f_hops = {
      nodeId: MAIN,
      nodeIdUtf8: utf8(MAIN),
      viewIngested: {
        cell: "graph-view",
        probeId: "ingest.node",
        logicalClock: (ingestHits[0] as { logicalClock?: number }).logicalClock ?? null,
        id: (ingestHits[0].payload as { id: string }).id,
        idUtf8: utf8((ingestHits[0].payload as { id: string }).id),
        byteIdentical: (ingestHits[0].payload as { id: string }).id === MAIN,
      },
      editorSelection: {
        cell: "editor-shell",
        probeId: "editor.select.recv.reveal",
        via: "V5 joined bus (graph click → editor busLog → recv.reveal)",
        busLogEntry: graphEvents[0],
        id: reveal.nodeId,
        idUtf8: utf8(reveal.nodeId),
        highlightApplied: reveal.highlightApplied,
        monacoRange: (reveal as { monacoRange?: unknown }).monacoRange ?? null,
        byteIdentical: reveal.nodeId === MAIN && graphEvents[0].nodeId === MAIN,
      },
    };

    // §7(b) at the view layer: FILLED outlines paint unknown rings, never
    // green, and outlineWasNull is FALSE (the analysis really filled them).
    const paints = (j.graphWall.pins.dump() as any).paints as Record<string, {
      fillStatus: string; fillColor: string; fillHatched: boolean;
      outlineStatus: string; outlineColor: string; outlineWasNull: boolean;
    }>;
    const moatPaintSummary: Record<string, unknown> = {};
    for (const n of moatExpect.graph.nodes as any[]) {
      const p = paints[n.id];
      expect(p, `paint for ${n.id}`).toBeTruthy();
      expect(p.outlineStatus).toBe("unknown");
      expect(p.outlineWasNull).toBe(false); // FILLED by the outer wall, not null
      expect(p.outlineColor).toBe(COLORS.unknown);
      expect(p.fillStatus).toBe("unknown");
      expect(p.fillHatched).toBe(true);
      expect(p.fillColor).not.toBe(COLORS.green);
      moatPaintSummary[n.id] = p;
    }
    evidence.b_view_moat_paints = {
      paints: moatPaintSummary,
      colorsUnknown: COLORS.unknown,
      colorsGreen: COLORS.green,
      allOutlinesUnknownFilled: true,
    };
  });
});
