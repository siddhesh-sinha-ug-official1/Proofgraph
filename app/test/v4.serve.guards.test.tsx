/**
 * V4 SEAM TEST — graph-model wall → hub HTTP → graph-view wall, the NEGATIVE
 * CONTROL + TYPED REFUSAL tests (SUB200 wave-2 split of v4.serve.test.tsx;
 * shared lifecycle + pin helpers hoisted VERBATIM to test/helpers/v4hub.ts +
 * v4pins.ts; this file spawns its OWN hub on ephemeral ports).
 *
 * Proven HERE:
 *  - NEGATIVE CONTROL serializer-edge-drop: a doctored served payload dropping
 *    one edge + one lead is caught BY NAME, pins prove which ids vanished;
 *  - typed hub refusals pass through VERBATIM (unknown-endpoint, both sides'
 *    pins);
 *  - envelope pin refusals: BOTH membranes refuse independently, each by name
 *    with pins attached.
 */

import { describe, test, expect } from "vitest";

import {
  assertEnvelopePin, fetchEnvelope, fetchGraphVerified, GraphSourceError,
  idByteOffsets, idSetsOf, verifyIdSets,
} from "../src/graphSource";
import { createGraphViewWall, GraphViewWallError } from "@graph-view/src/wall";
import { setupV4Hub, httpGet } from "./helpers/v4hub";
import { localBus, of, last, pinsHistory, rfPartition, type AnyEvent } from "./helpers/v4pins";

const ctx = setupV4Hub();

describe("V4 — graph-model wall → hub → graph-view wall (Python↔TS)", () => {

  test("NEGATIVE CONTROL — serializer-edge-drop: a doctored served payload dropping one edge + one lead is caught by name, pins prove which ids vanished", async () => {
    const { served, truth } = ctx;
    const doctored = structuredClone(served.envelope);
    const droppedEdge = doctored.edges.splice(0, 1)[0] as { id: string };
    const droppedLead = doctored.leads.splice(0, 1)[0] as { id: string };

    // graphSource's gate: the NAMED class, listing exactly the vanished ids.
    let caught: GraphSourceError | null = null;
    try {
      verifyIdSets(idSetsOf(doctored as any), truth.idSets);
    } catch (e) {
      caught = e as GraphSourceError;
    }
    expect(caught).toBeInstanceOf(GraphSourceError);
    expect(caught!.failureClass).toBe("serializer-edge-drop");
    const div = (caught!.detail.divergences as any[]);
    expect(div.find((d) => d.key === "edges")).toMatchObject({ missing: [droppedEdge.id], extra: [] });
    expect(div.find((d) => d.key === "leads")).toMatchObject({ missing: [droppedLead.id], extra: [] });
    expect(caught!.message).toContain(droppedEdge.id);
    expect(caught!.message).toContain(droppedLead.id);

    // PINS PROVE WHICH ID VANISHED: both ids are byte-present in the model wall's
    // pin-surface truth payload AND carry extractor mint pins — while the view
    // mounted on the doctored payload provably never saw them.
    expect(idByteOffsets(truth.bytes, droppedEdge.id).length).toBeGreaterThan(0);
    expect(idByteOffsets(truth.bytes, droppedLead.id).length).toBeGreaterThan(0);
    const hist = await pinsHistory(ctx.BASE);
    const pinnedEdgeIds = new Set(of(hist.cells["structure-extractor"].events, "extractor.assemble.edge.id")
      .map((e: AnyEvent) => String(e.payload.edgeId)));
    expect(pinnedEdgeIds.has(droppedEdge.id)).toBe(true);
    expect(pinnedEdgeIds.has(droppedLead.id)).toBe(true);

    const doctoredBus = localBus();
    const doctoredWall = await createGraphViewWall(structuredClone(doctored), doctoredBus);
    ctx.disposables.push(doctoredWall);
    const view = rfPartition(doctoredWall);
    // The view STANDS on what it was fed (it cannot know the truth alone) —
    // that is exactly why the three-way gate exists. The equality leg now
    // identifies the vanished ids precisely:
    const missingEdges = truth.idSets.edges.filter((id) => !view.resolvedEdgeIds.includes(id));
    const missingLeads = truth.idSets.leads.filter((id) => !view.leadEdgeIds.includes(id));
    expect(missingEdges).toEqual([droppedEdge.id]);
    expect(missingLeads).toEqual([droppedLead.id]);
    // Pin×pin count mismatch across the boundary (view ingest vs model accepted):
    const accepted = last(hist.cells["graph-model"].events, "graph-model.wall.ingest.accepted").payload;
    const viewCount = last(doctoredWall.pins.history(), "ingest.edge.count").payload;
    expect(viewCount.accepted).toBe(accepted.edgeCount + accepted.leadCount - 2);

    // Recovery: the REAL hub path still verifies clean (the doctoring was ours).
    const reverified = await fetchGraphVerified(ctx.BASE, httpGet);
    expect(reverified.counts).toEqual({ nodes: 13, edges: 8, leads: 3 });
  });

  test("typed hub refusals pass through VERBATIM: unknown-endpoint (client error × hub pin)", async () => {
    let caught: GraphSourceError | null = null;
    try {
      await fetchEnvelope(`${ctx.BASE}/graphx`, httpGet);
    } catch (e) {
      caught = e as GraphSourceError;
    }
    expect(caught).toBeInstanceOf(GraphSourceError);
    expect(caught!.failureClass).toBe("unknown-endpoint");
    expect((caught!.detail as any).status).toBe(404);
    // The hub's own pin recorded the same refusal (both sides of the seam).
    const hist = await pinsHistory(ctx.BASE);
    const refused = of(hist.hub.events, "hub.http.refused")
      .filter((e: AnyEvent) => e.payload.path === "/graphx");
    expect(refused.length).toBeGreaterThan(0);
    expect(refused[refused.length - 1].payload.failureClass).toBe("unknown-endpoint");
  });

  test("envelope pin refusals: BOTH membranes refuse independently, each by name with pins attached", async () => {
    const { served } = ctx;
    // (a) drifted schemaVersion
    const drifted = { ...structuredClone(served.envelope), schemaVersion: "v999" };
    expect(() => assertEnvelopePin(drifted)).toThrowError(
      expect.objectContaining({ failureClass: "envelope-version-mismatch" }));
    let wallErr: GraphViewWallError | null = null;
    try {
      await createGraphViewWall(structuredClone(drifted), localBus());
    } catch (e) {
      wallErr = e as GraphViewWallError;
    }
    expect(wallErr).toBeInstanceOf(GraphViewWallError);
    expect(wallErr!.failureClass).toBe("schema-pin-mismatch");
    expect(wallErr!.pins).not.toBeNull();
    const rej = last(wallErr!.pins!.history() as AnyEvent[], "wall.face.reject").payload;
    expect(rej.failureClass).toBe("schema-pin-mismatch");
    expect(last(wallErr!.pins!.history() as AnyEvent[], "ingest.envelope.version").payload)
      .toMatchObject({ present: true, value: "v999", ok: false });

    // (b) missing schemaVersion
    const missing = structuredClone(served.envelope) as unknown as Record<string, unknown>;
    delete missing.schemaVersion;
    expect(() => assertEnvelopePin(missing)).toThrowError(
      expect.objectContaining({ failureClass: "envelope-rejected" }));
    let wallErr2: GraphViewWallError | null = null;
    try {
      await createGraphViewWall(structuredClone(missing), localBus());
    } catch (e) {
      wallErr2 = e as GraphViewWallError;
    }
    expect(wallErr2).toBeInstanceOf(GraphViewWallError);
    expect(wallErr2!.failureClass).toBe("envelope-rejected");
    expect(wallErr2!.pins).not.toBeNull();
    expect(last(wallErr2!.pins!.history() as AnyEvent[], "ingest.envelope.version").payload)
      .toMatchObject({ present: false, ok: false });
  });
});
