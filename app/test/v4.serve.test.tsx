/**
 * V4 SEAM TEST — graph-model wall → hub HTTP → graph-view wall (THE Python↔TS vessel).
 *
 * A REAL python hub process (vessels/serve_hub_v4.py: hub/pipeline.py extract→ingest
 * on cell 3's richpkg fixture, recorded pyright, walls only) is spawned on ephemeral
 * ports; this vitest (jsdom) side fetches the served canonical envelope through
 * app/src/graphSource.ts and mounts the graph-view WALL on it.
 *
 * SUB200 restructure (wave 2): the original single-file suite split by test
 * groups — THIS file keeps its ORIGINAL NAME (faultcheck/run_faults.py fault
 * (b) invokes `npx vitest run test/v4.serve.test.tsx` by name; the injected
 * id-flip still fails HERE, in the beforeAll fetchGraphVerified gate + the
 * three-way test, carrying the serializer-edge-drop signature) and carries
 * the health + THREE-WAY EQUALITY tests. Siblings: v4.serve.verdicts (unknown
 * + leads), v4.serve.guards (negative control + typed refusals),
 * v4.serve.trace (the system trace seed). Shared lifecycle + pin helpers
 * hoisted VERBATIM to test/helpers/v4hub.ts + v4pins.ts; every split file
 * spawns its OWN hub on ephemeral ports. No test renamed, no assertion
 * weakened.
 *
 * THE THREE-WAY EQUALITY TEST (the cheap serializer is the edge-dropper):
 *   (1) hub-served /graph bytes → parsed → node/edge/lead ID SETS
 *   (2) == the graph-model wall's truth (/graph/truth — the envelope rebuilt hub-side
 *       from modelWall.pins.dump()["wall"]["ingested"], canonical json DIRECT, bypassing
 *       the /graph serializer seam) — id sets AND byte-level id equality
 *   (3) == the graph-view wall's dump() (rfNodes ids, resolvedEdge ids, leadEdge ids)
 *       after createGraphViewWall(served, bus).
 *
 * EVERY connector assertion reads BOTH sides' pins across the boundary — never
 * a return value alone. Bounds honored out loud (/pins/history ?limit with
 * truncated:false ASSERTED). Teardown clean by construction (stdin EOF).
 */

import { describe, test, expect } from "vitest";

import { PINNED_SCHEMA_HASH, PINNED_SCHEMA_VERSION, verifyIdSets } from "../src/graphSource";
import { WALL_SCHEMA_HASH, WALL_SCHEMA_VERSION } from "@graph-view/src/wall";
import { setupV4Hub, getJson } from "./helpers/v4hub";
import { sha256, of, last, pinsHistory, rfPartition, setEq, byteIdentical, type AnyEvent } from "./helpers/v4pins";

const ctx = setupV4Hub();

describe("V4 — graph-model wall → hub → graph-view wall (Python↔TS)", () => {

  test("health: schema pin agrees across hub, graphSource, and graph-view wall (carried-pin equality)", async () => {
    const { status, body } = await getJson(`${ctx.BASE}/health`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.pipelineLoaded).toBe(true);
    // ONE pin, three carriers: hub /health == graphSource carried == view wall carried.
    expect(body.schemaPin.schemaVersion).toBe(PINNED_SCHEMA_VERSION);
    expect(body.schemaPin.schemaHash).toBe(PINNED_SCHEMA_HASH);
    expect(WALL_SCHEMA_VERSION).toBe(PINNED_SCHEMA_VERSION);
    expect(WALL_SCHEMA_HASH).toBe(PINNED_SCHEMA_HASH);
    expect(body.wallVersions["graph-model"]).toBe("graph-model-wall/1.0.0");
    expect(body.wallVersions["structure-extractor"]).toBe("structure-extractor-wall/1.0.0");
    // The V4 truth endpoint is CATALOGUED on the hub (never a dark lead).
    const cat = await getJson(`${ctx.BASE}/pins/catalog`);
    const hubIds = cat.body.hub.catalog.map((r: any) => r.probeId);
    expect(hubIds).toContain("hub.serve.truth");
    expect(hubIds).toContain("hub.serve.truth.refused");
    // Absent capability stream is surfaced absent, never fabricated (V1's seam).
    expect(cat.body.cells["capability-layer"].available).toBe(false);
  });

  test("THE THREE-WAY EQUALITY: served /graph == model wall pin-surface truth == view dump(), ids byte-identical", async () => {
    const { served, truth, viewWall, INFO } = ctx;
    // Leg 1 == Leg 2 already gated inside fetchGraphVerified (id sets + byte presence);
    // re-assert the strongest healthy-path form: byte-identical payloads.
    expect(sha256(served.bytes)).toBe(sha256(truth.bytes));
    expect(served.envelope.schemaVersion).toBe(PINNED_SCHEMA_VERSION);
    expect(verifyIdSets(served.idSets, truth.idSets).ok).toBe(true);
    // Fixture shape (frozen richpkg): 13 nodes / 8 edges / 3 leads, and the
    // launcher's own pipeline return agrees.
    expect(truth.idSets.nodes.length).toBe(13);
    expect(truth.idSets.edges.length).toBe(8);
    expect(truth.idSets.leads.length).toBe(3);
    expect(INFO.nodes).toBe(13);
    expect(INFO.edges).toBe(8);
    expect(INFO.leads).toBe(3);

    // ── MODEL-WALL PINS (across the HTTP boundary, /pins/history) ────────────
    const hist = await pinsHistory(ctx.BASE);
    const gm: AnyEvent[] = hist.cells["graph-model"].events;
    const accepted = last(gm, "graph-model.wall.ingest.accepted").payload;
    expect(accepted.nodeCount).toBe(truth.idSets.nodes.length);
    expect(accepted.edgeCount).toBe(truth.idSets.edges.length);
    expect(accepted.leadCount).toBe(truth.idSets.leads.length);
    expect(last(gm, "graph-model.wall.ingest.verify.nodeIds").payload).toMatchObject({ pass: true, checked: 13 });
    expect(last(gm, "graph-model.wall.ingest.verify.edgeIds").payload).toMatchObject({ pass: true, checked: 11 });
    expect(last(gm, "graph-model.wall.ingest.verify.leads").payload).toMatchObject({ pass: true, checked: 3 });

    // ── EXTRACTOR PINS: the ids were born there, byte-identical (3rd membrane back) ──
    const ex: AnyEvent[] = hist.cells["structure-extractor"].events;
    const pinnedNodeIds = of(ex, "extractor.t1.node.id").map((e) => String(e.payload.id));
    byteIdentical(pinnedNodeIds, truth.idSets.nodes, served.bytes);
    const pinnedEdgeIds = new Set(of(ex, "extractor.assemble.edge.id").map((e) => String(e.payload.edgeId)));
    for (const id of [...truth.idSets.edges, ...truth.idSets.leads]) {
      expect(pinnedEdgeIds.has(id), `edge/lead ${id} has no extractor mint pin`).toBe(true);
    }

    // ── HUB PINS: the serve events carry the same counts + byte length ───────
    const hubEvents: AnyEvent[] = hist.hub.events;
    expect(last(hubEvents, "hub.serve.graph").payload).toMatchObject({
      bytes: served.bytes.length, nodes: 13, edges: 8, leads: 3,
    });
    expect(last(hubEvents, "hub.serve.truth").payload).toMatchObject({
      bytes: truth.bytes.length, nodes: 13, edges: 8, leads: 3,
    });

    // ── Leg 3: the VIEW WALL's dump() — set-equal, byte-identical ────────────
    const { dump, nodeIds, placeholderIds, resolvedEdgeIds, leadEdgeIds } = rfPartition(viewWall);
    setEq(nodeIds, served.idSets.nodes);
    setEq(resolvedEdgeIds, served.idSets.edges);
    setEq(leadEdgeIds, served.idSets.leads);
    // Ghost accounting stays exact: the placeholder set is EXACTLY the distinct
    // unresolved lead targets — nothing extra invented, nothing silently added.
    const leadDsts = [...new Set(truth.envelope.leads.map((l) => String((l as any).dstId)))];
    setEq(placeholderIds, leadDsts);
    byteIdentical(nodeIds, truth.idSets.nodes, served.bytes);
    byteIdentical(resolvedEdgeIds, truth.idSets.edges, served.bytes);
    byteIdentical(leadEdgeIds, truth.idSets.leads, served.bytes);

    // ── VIEW PINS × MODEL PINS (the cross-boundary pin×pin reconciliation) ───
    const vh: AnyEvent[] = viewWall.pins.history();
    expect(last(vh, "ingest.node.count").payload).toMatchObject({ accepted: accepted.nodeCount, rejected: 0 });
    expect(last(vh, "ingest.edge.count").payload).toMatchObject({
      accepted: accepted.edgeCount + accepted.leadCount, // view merges edges+leads internally
      rejected: 0,
      resolvedTrue: accepted.edgeCount,
      resolvedFalse: accepted.leadCount,
    });
    const equality = last(vh, "render.edge.equality").payload;
    expect(equality.equal).toBe(true);
    expect(equality.eaten).toEqual([]);
    expect(equality.phantom).toEqual([]);
    // wall.face.result declares RENDERED counts: 13 schema nodes + 3 probed ghost
    // placeholders (one per distinct unresolved lead target) = 16; edges 8+3 = 11.
    expect(last(vh, "wall.face.result").payload).toMatchObject({ nodes: 16, edges: 11, leads: 3 });
    expect(dump.rejectedNodes).toEqual([]);
    expect(dump.rejectedEdges).toEqual([]);
  });
});
