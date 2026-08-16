/**
 * V4 SEAM TEST — graph-model wall → hub HTTP → graph-view wall, the SYSTEM
 * TRACE SEED (SUB200 wave-2 split of v4.serve.test.tsx; shared lifecycle +
 * pin helpers hoisted VERBATIM to test/helpers/v4hub.ts + v4pins.ts; this
 * file spawns its OWN hub on ephemeral ports).
 *
 * Proven HERE: one Node.id byte-identical at every hop (extractor pin →
 * model-wall ingest → hub-served /graph → view dump()) — written to
 * vessels/TRACE-node.json for the Phase-3 trace to extend.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { describe, test, expect } from "vitest";

import { utf8Identical, idByteOffsets } from "../src/graphSource";
import { setupV4Hub, TRACE_OUT } from "./helpers/v4hub";
import { sha256, of, last, pinsHistory, rfPartition, type AnyEvent } from "./helpers/v4pins";

const ctx = setupV4Hub();

describe("V4 — graph-model wall → hub → graph-view wall (Python↔TS)", () => {

  test("SYSTEM TRACE SEED: one Node.id byte-identical at every hop — written to vessels/TRACE-node.json", async () => {
    const { served, truth, viewWall, INFO } = ctx;
    const target = truth.envelope.nodes.find((n) => (n as any).name === INFO.entryName) as any;
    expect(target, `no node named ${INFO.entryName} in the truth envelope`).toBeDefined();
    const nodeId: string = target.id;
    // The declared model root resolved (name→id, hub-side) to this same id.
    expect(INFO.declaredRoots).toEqual([nodeId]);

    const hist = await pinsHistory(ctx.BASE);
    // Hop 1 — extractor pin: the id at its BIRTH, with the minted preimage.
    const exPin = of(hist.cells["structure-extractor"].events, "extractor.t1.node.id")
      .find((e: AnyEvent) => String(e.payload.id) === nodeId);
    expect(exPin).toBeDefined();
    // Hop 2 — model wall pin: ingest.accepted carries the id LITERALLY in rootIds.
    const gmPin = last(hist.cells["graph-model"].events, "graph-model.wall.ingest.accepted");
    expect(gmPin.payload.rootIds).toContain(nodeId);
    // Hop 3 — served envelope: the id as exact UTF-8 bytes inside /graph's payload.
    const servedOffsets = idByteOffsets(served.bytes, nodeId);
    expect(servedOffsets.length).toBeGreaterThan(0);
    // Hop 4 — view dump: the id in rfNodes + the view's own ingest pin.
    const view = rfPartition(viewWall);
    expect(view.nodeIds).toContain(nodeId);
    const viewPin = (viewWall.pins.history() as AnyEvent[])
      .find((e) => e.probeId === "ingest.node" && (e.payload as any)?.id === nodeId);
    expect(viewPin).toBeDefined();

    // Byte-identity across all four hops: extractor pin, truth (model pin surface),
    // served payload substring at the located byte offset, and the view's copies.
    const servedSlice = new TextDecoder("utf-8").decode(
      served.bytes.slice(servedOffsets[0] + 6, servedOffsets[0] + 6 + nodeId.length)); // skip `"id":"`
    const viewDumpId = view.nodeIds.find((id) => id === nodeId)!;
    for (const other of [String(exPin!.payload.id), servedSlice, String((viewPin!.payload as any).id), viewDumpId]) {
      expect(utf8Identical(nodeId, other)).toBe(true);
    }
    const idSha = sha256(nodeId);

    const trace = {
      nodeId,
      name: INFO.entryName,
      idSha256: idSha,
      idUtf8Bytes: Array.from(new TextEncoder().encode(nodeId)),
      byteIdentical: true,
      provenance:
        "V4 system trace seed: one Node.id proven byte-identical at extraction → " +
        "graph-model ingest → hub-served /graph → graph-view dump(). Phase 3 appends " +
        "the editor-selection hop to hops[].",
      fixture: "packages/structure-extractor/fixtures/pyrich (richpkg; recorded pyright)",
      hops: {
        extractorPin: {
          cell: "structure-extractor",
          probeId: "extractor.t1.node.id",
          logicalClock: exPin!.logicalClock,
          id: String(exPin!.payload.id),
          preimage: exPin!.payload.preimage,
          via: "GET /pins/history (extractor wall stream)",
        },
        modelPin: {
          cell: "graph-model",
          probeId: "graph-model.wall.ingest.accepted",
          logicalClock: gmPin.logicalClock,
          id: nodeId,
          idInRootIds: true,
          pinSurfaceEndpoint: "/graph/truth (pins.dump()['wall']['ingested'])",
          truthPayloadSha256: sha256(truth.bytes),
        },
        servedEnvelope: {
          endpoint: "/graph",
          id: nodeId,
          idByteOffsets: servedOffsets,
          payloadSha256: sha256(served.bytes),
          payloadBytes: served.bytes.length,
        },
        viewDump: {
          cell: "graph-view",
          probeId: "ingest.node",
          logicalClock: viewPin!.logicalClock,
          id: String((viewPin!.payload as any).id),
          rfNodePresent: true,
          wallVersion: "graph-view-wall/1.0.0",
        },
      },
    };
    writeFileSync(TRACE_OUT, JSON.stringify(trace, null, 2) + "\n", "utf8");
    const readBack = JSON.parse(readFileSync(TRACE_OUT, "utf8"));
    expect(readBack.nodeId).toBe(nodeId);
    expect(readBack.hops.extractorPin.id).toBe(nodeId);
    expect(readBack.hops.viewDump.id).toBe(nodeId);
  });
});
