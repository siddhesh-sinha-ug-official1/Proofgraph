/**
 * Gate 2 — schema-ingest golden. The fixture → a fixed GraphModel and a fixed
 * structural ingest.* probe prefix. Malformed records → reject probes with a
 * reason: never a silent include, never a crash.
 */

import { describe, expect, it } from "vitest";
import { ProbeBus } from "./probeBus";
import { KNOWN_PROBE_IDS } from "./probeCatalog";
import { ingest } from "./ingest";
import { SKELETON, eventsFor, payloadOf, soleEvent } from "./testUtil";

const busFor = () => new ProbeBus(KNOWN_PROBE_IDS);

describe("gate 2 — schema-ingest golden", () => {
  it("ingests the skeleton fixture into a fixed GraphModel with the full probe trail", () => {
    const bus = busFor();
    const { model, rejectedNodes, rejectedEdges } = ingest(SKELETON(), bus);

    expect(model.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
    expect(model.edges.map((e) => e.id)).toEqual(["e-AB", "e-BC"]);
    expect(rejectedNodes).toEqual([]);
    expect(rejectedEdges).toEqual([]);

    // Probe assertions — the test substrate is the probe stream, not return values.
    // Assembly ruling 3: the fixture now carries the canonical envelope — e-BC
    // (resolved:false) moved from edges[] into leads[], so the input census is 1+1.
    expect(payloadOf<{ nodeCount: number; edgeCount: number; leadCount: number }>(soleEvent(bus, "ingest.input"))).toMatchObject({
      nodeCount: 3, edgeCount: 1, leadCount: 1,
    });
    expect(payloadOf<{ ok: boolean; value?: string }>(soleEvent(bus, "ingest.envelope.version"))).toMatchObject({
      present: true, value: "v0", ok: true,
    });
    expect(eventsFor(bus, "ingest.node")).toHaveLength(3);
    expect(eventsFor(bus, "ingest.edge")).toHaveLength(2);
    expect(payloadOf<{ ok: boolean }>(soleEvent(bus, "ingest.schema.valid")).ok).toBe(true);
    expect(payloadOf<object>(soleEvent(bus, "ingest.node.count"))).toEqual({ accepted: 3, rejected: 0 });
    expect(payloadOf<object>(soleEvent(bus, "ingest.edge.count"))).toEqual({
      accepted: 2, rejected: 0, resolvedTrue: 1, resolvedFalse: 1,
    });
    expect(payloadOf<Record<string, number>>(soleEvent(bus, "ingest.node.langDist")).lean).toBe(3);
    expect(payloadOf<Record<string, number>>(soleEvent(bus, "ingest.node.kindDist"))).toMatchObject({
      theorem: 2, decl: 1,
    });
    expect(payloadOf<Record<string, number>>(soleEvent(bus, "ingest.edge.kindDist"))).toMatchObject({
      proof_uses: 1, references: 1,
    });
    expect(payloadOf<object>(soleEvent(bus, "ingest.output"))).toEqual({ nodes: 3, edges: 2 });

    // Causal chain: every per-record probe points back at ingest.input.
    const inputId = `ingest.input#${soleEvent(bus, "ingest.input").logicalClock}`;
    for (const e of eventsFor(bus, "ingest.node")) expect(e.causeId).toBe(inputId);
  });

  it("rejects a node with a missing required field — with a reason, no crash, no silent include", () => {
    const bus = busFor();
    const fixture = SKELETON() as { nodes: Record<string, unknown>[]; edges: unknown[] };
    delete fixture.nodes[1].fill;
    const { model, rejectedNodes } = ingest(fixture, bus);

    expect(model.nodes.map((n) => n.id)).toEqual(["A", "C"]);
    expect(rejectedNodes).toHaveLength(1);
    expect(payloadOf<{ field: string }>(soleEvent(bus, "ingest.node.field.missing")).field).toBe("fill");
    const reject = soleEvent(bus, "ingest.node.reject");
    expect(payloadOf<{ nodeId: string; reason: string }>(reject)).toMatchObject({ nodeId: "B" });
    expect(payloadOf<{ reason: string }>(reject).reason).toContain("fill");
    expect(payloadOf<{ ok: boolean; nodeErrors: number }>(soleEvent(bus, "ingest.schema.valid"))).toMatchObject({
      ok: false, nodeErrors: 1,
    });
  });

  it("rejects a node with a value outside its enum", () => {
    const bus = busFor();
    const fixture = SKELETON() as { nodes: { kind: string }[]; edges: unknown[] };
    fixture.nodes[0].kind = "gadget";
    const { model } = ingest(fixture, bus);

    expect(model.nodes.map((n) => n.id)).toEqual(["B", "C"]);
    expect(payloadOf<{ field: string; value: string }>(soleEvent(bus, "ingest.node.enum.bad"))).toMatchObject({
      field: "kind", value: "gadget",
    });
  });

  it("green may never be faked at ingest either: a fill.status outside the enum is rejected, not coerced", () => {
    const bus = busFor();
    const fixture = SKELETON() as { nodes: { fill: { status: string } }[]; edges: unknown[] };
    fixture.nodes[2].fill.status = "verified"; // not an enum member — must NOT slide toward green
    const { model } = ingest(fixture, bus);
    expect(model.nodes).toHaveLength(2);
    expect(payloadOf<{ field: string }>(soleEvent(bus, "ingest.node.enum.bad")).field).toBe("fill.status");
  });

  it("rejects an edge with a dangling non-placeholder endpoint LOUDLY (accepted-then-unrendered would be F1)", () => {
    const bus = busFor();
    // Ruling 3: e-BC now lives in leads[] in the fixture; the dangling check
    // covers leads exactly like edges.
    const fixture = SKELETON() as { nodes: unknown[]; leads: { dstId: string }[] };
    fixture.leads[0].dstId = "GONE";
    const { model } = ingest(fixture, bus);

    expect(model.edges.map((e) => e.id)).toEqual(["e-AB"]);
    const dangling = soleEvent(bus, "ingest.edge.danglingRef");
    expect(payloadOf<object>(dangling)).toMatchObject({
      edgeId: "e-BC", missingEndpoint: "dst", refId: "GONE", legalPlaceholder: false,
    });
    expect(eventsFor(bus, "ingest.edge.reject")).toHaveLength(1);
  });

  it("accepts a lead to an explicit unresolved-target placeholder (legal, logged)", () => {
    const bus = busFor();
    // Ruling 3: the unresolved-target placeholder lives on a lead's dstId now.
    const fixture = SKELETON() as { nodes: unknown[]; leads: { dstId: string; resolved: boolean }[] };
    fixture.leads[0].dstId = "unresolved:ext.mystery";
    const { model } = ingest(fixture, bus);

    expect(model.edges.map((e) => e.id)).toEqual(["e-AB", "e-BC"]);
    expect(payloadOf<{ legalPlaceholder: boolean }>(soleEvent(bus, "ingest.edge.danglingRef")).legalPlaceholder).toBe(true);
    expect(eventsFor(bus, "ingest.edge.reject")).toHaveLength(0);
  });

  it("survives garbage input without crashing (empty model, probed)", () => {
    const bus = busFor();
    const { model, rejectedEnvelope } = ingest("not even an object", bus);
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
    expect(payloadOf<{ nodeCount: number }>(soleEvent(bus, "ingest.input")).nodeCount).toBe(0);
    // Garbage also fails the canonical-envelope gate (no schemaVersion) — loudly.
    expect(rejectedEnvelope).not.toBeNull();
  });
});

// Assembly ruling 3 — the canonical Graph envelope {schemaVersion:"v0", nodes, edges, leads}.
describe("gate 2b — canonical envelope (assembly ruling 3 + schema pin)", () => {
  it("a payload MISSING schemaVersion is rejected whole — probed, empty model, never a partial include", () => {
    const bus = busFor();
    const fixture = SKELETON() as Record<string, unknown>;
    delete fixture.schemaVersion;
    const { model, rejectedEnvelope } = ingest(fixture, bus);

    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
    expect(rejectedEnvelope).not.toBeNull();
    expect(rejectedEnvelope!.reason).toContain("schemaVersion missing");
    expect(payloadOf<object>(soleEvent(bus, "ingest.envelope.version"))).toMatchObject({
      present: false, expected: "v0", ok: false,
    });
    expect(payloadOf<{ ok: boolean; envelopeOk: boolean }>(soleEvent(bus, "ingest.schema.valid"))).toMatchObject({
      ok: false, envelopeOk: false,
    });
  });

  it("a schemaVersion that fails the pin ('v1') is rejected whole as schema-pin-mismatch", () => {
    const bus = busFor();
    const fixture = SKELETON() as Record<string, unknown>;
    fixture.schemaVersion = "v1";
    const { model, rejectedEnvelope } = ingest(fixture, bus);

    expect(model.nodes).toEqual([]);
    expect(rejectedEnvelope!.reason).toContain("schema-pin-mismatch");
    expect(payloadOf<object>(soleEvent(bus, "ingest.envelope.version"))).toMatchObject({
      present: true, value: "v1", expected: "v0", ok: false,
    });
  });

  it("resolved:false inside edges[] is a REJECTION (was accepted pre-assembly) — resolved:false lives ONLY in leads[]", () => {
    const bus = busFor();
    const fixture = SKELETON() as { edges: unknown[]; leads: unknown[] };
    // Misfile the lead into edges[] (the pre-assembly shape).
    fixture.edges.push(fixture.leads[0]);
    fixture.leads = [];
    const { model, rejectedEdges } = ingest(fixture, bus);

    expect(model.edges.map((e) => e.id)).toEqual(["e-AB"]);
    expect(rejectedEdges).toHaveLength(1);
    expect(rejectedEdges[0].reason).toContain("ruling 3");
    expect(payloadOf<object>(soleEvent(bus, "ingest.edge.segregation"))).toMatchObject({
      edgeId: "e-BC", list: "edges", resolved: false,
    });
    expect(eventsFor(bus, "ingest.edge.reject")).toHaveLength(1);
  });

  it("resolved:true inside leads[] is equally a rejection (segregation is two-sided)", () => {
    const bus = busFor();
    const fixture = SKELETON() as { leads: { resolved: boolean }[] };
    fixture.leads[0].resolved = true;
    const { model, rejectedEdges } = ingest(fixture, bus);

    expect(model.edges.map((e) => e.id)).toEqual(["e-AB"]);
    expect(rejectedEdges).toHaveLength(1);
    expect(payloadOf<object>(soleEvent(bus, "ingest.edge.segregation"))).toMatchObject({
      edgeId: "e-BC", list: "leads", resolved: true,
    });
  });
});
