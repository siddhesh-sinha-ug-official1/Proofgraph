/**
 * Phase-0 assembly gate — ONE schema. The cell's membrane (src/schema.ts) is a
 * direct re-export of the canonical packages/schema/gen/graph-schema.ts (swap
 * pattern (a)); this suite pins that fact so drift explodes loudly:
 *   (1) checkPin: packages/schema/schema.json canonically hashed must match the
 *       pinned (schemaVersion, schemaHash) — failure-class=schema-pin-mismatch.
 *   (2) membrane identity: the re-exported constants ARE the canonical objects
 *       (no local transcription survives), and the assembly rulings are live.
 *   (3) probeCatalog payloadType strings: the enum spellings embedded in the
 *       catalog's payloadType text are verified-in-sync against the canonical
 *       enums (pattern (b) — closes the known soft-copy drift hole).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PINNED_SCHEMA_HASH, PINNED_SCHEMA_VERSION, canonicalJson, checkPin,
} from "../../schema/gen/pin";
import {
  EDGE_KINDS, FILL_STATUSES, LANGS, NODE_KINDS, ORIGINS, OUTLINE_WORST_ORDER,
  TIERS, UNRESOLVED_PLACEHOLDER_PREFIX, WORST_TO_STATUS,
} from "../../schema/gen/graph-schema";
import * as membrane from "./schema";
import { PROBE_CATALOG } from "./probeCatalog";
import { WORST_CASE_ORDER_STRING } from "./verdict";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPkg = join(here, "..", "..", "schema");

describe("schema pin — checkPin against the canonical schema.json (fail fast on drift)", () => {
  it("schema.json canonically hashed matches the PIN and checkPin passes", () => {
    const schemaObj = JSON.parse(readFileSync(join(schemaPkg, "schema.json"), "utf8")) as {
      schemaVersion: string;
    };
    const hash = createHash("sha256").update(canonicalJson(schemaObj), "utf8").digest("hex");
    expect(hash).toBe(PINNED_SCHEMA_HASH);
    expect(() => checkPin(schemaObj.schemaVersion, hash)).not.toThrow();
  });

  it("the PIN file and gen/pin.ts constants agree (extracted-constant equality)", () => {
    const pinText = readFileSync(join(schemaPkg, "PIN"), "utf8");
    expect(pinText).toContain(`schemaVersion ${PINNED_SCHEMA_VERSION}`);
    expect(pinText).toContain(`schemaHash ${PINNED_SCHEMA_HASH}`);
    expect(PINNED_SCHEMA_VERSION).toBe("v0");
  });

  it("checkPin rejects a drifted version or hash loudly (failure-class=schema-pin-mismatch)", () => {
    expect(() => checkPin("v1", PINNED_SCHEMA_HASH)).toThrow(/schema-pin-mismatch/);
    expect(() => checkPin(PINNED_SCHEMA_VERSION, "0".repeat(64))).toThrow(/schema-pin-mismatch/);
  });
});

describe("membrane identity — src/schema.ts IS the canonical schema (swap pattern (a))", () => {
  it("re-exported constants are the canonical objects themselves, not copies", () => {
    expect(membrane.NODE_KINDS).toBe(NODE_KINDS);
    expect(membrane.LANGS).toBe(LANGS);
    expect(membrane.EDGE_KINDS).toBe(EDGE_KINDS);
    expect(membrane.ORIGINS).toBe(ORIGINS);
    expect(membrane.TIERS).toBe(TIERS);
    expect(membrane.VERDICT_STATUSES).toBe(FILL_STATUSES);
    expect(membrane.WORST_CASE_ORDER).toBe(OUTLINE_WORST_ORDER);
    expect(membrane.WORST_TO_STATUS).toBe(WORST_TO_STATUS);
    expect(membrane.UNRESOLVED_PLACEHOLDER_PREFIX).toBe(UNRESOLVED_PLACEHOLDER_PREFIX);
    expect(membrane.SCHEMA_VERSION).toBe(PINNED_SCHEMA_VERSION);
  });

  it("assembly ruling 1 is live: worstTokenToStatus maps definition→blue (and lemma/none/green→green)", () => {
    expect(WORST_TO_STATUS).toEqual({
      red: "red", amber: "amber", blue: "blue", definition: "blue",
      lemma: "green", none: "green", green: "green",
    });
  });

  it("assembly ruling 4 is live: the split canonical order, fused 'none/green' banned", () => {
    expect(OUTLINE_WORST_ORDER).toEqual(["red", "amber", "blue", "definition", "lemma", "none", "green"]);
    expect(OUTLINE_WORST_ORDER as readonly string[]).not.toContain("none/green");
    expect(WORST_CASE_ORDER_STRING).toBe(OUTLINE_WORST_ORDER.join(">"));
    expect(membrane.rankWorstToken("no-such-token")).toEqual({ rank: -1, recognized: false });
  });
});

describe("probeCatalog payloadType strings — verified-in-sync vs canonical enums (pattern (b))", () => {
  const entry = (probeId: string) => {
    const e = PROBE_CATALOG.find((c) => c.probeId === probeId);
    if (!e) throw new Error(`catalog entry ${probeId} missing`);
    return e;
  };

  it("the ingest distribution payloadTypes spell exactly the canonical enums", () => {
    expect(entry("ingest.node.langDist").payloadType).toBe(`{${LANGS.join(",")}:int}`);
    expect(entry("ingest.node.kindDist").payloadType).toBe(`{${NODE_KINDS.join(",")}:int}`);
    expect(entry("ingest.edge.kindDist").payloadType).toBe(`{${EDGE_KINDS.join(",")}:int}`);
  });

  it("the verdict histogram payloadType embeds the canonical fill-status enum", () => {
    expect(entry("verdict.histogram").payloadType).toContain(`fill:{${FILL_STATUSES.join(",")}}`);
  });

  it("the envelope gate payloadType pins the canonical version literal", () => {
    expect(entry("ingest.envelope.version").payloadType).toContain(`expected:'${PINNED_SCHEMA_VERSION}'`);
  });
});
