/**
 * Outline-policy + enum gates (split from schema-package.test.ts, SUB200).
 * VERDICT_CASES (tests/context.ts) is duplicated VERBATIM from
 * tests/context.py — the same table passing on both implementations is the
 * outline-policy agreement gate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION, SCHEMA_REVISION,
  NODE_KINDS, EDGE_KINDS, LANGS, FILL_STATUSES, ORIGINS, TIERS,
  OUTLINE_WORST_ORDER, WORST_TO_STATUS,
  UNRESOLVED_PLACEHOLDER_PREFIX, isUnresolvedPlaceholder,
  rankWorstToken, worstOfVerdict,
} from "../gen/graph-schema.ts";
import { schemaObj, VERDICT_CASES } from "./context.ts";

test("enums match schema.json", () => {
  const nodeProps = schemaObj.$defs.Node.properties;
  assert.deepEqual([...NODE_KINDS], nodeProps.kind.enum);
  assert.deepEqual([...EDGE_KINDS], schemaObj.$defs.Edge.properties.kind.enum);
  assert.deepEqual([...LANGS], nodeProps.lang.enum);
  assert.deepEqual([...FILL_STATUSES], nodeProps.fill.properties.status.enum);
  assert.deepEqual([...ORIGINS], nodeProps.origin.enum);
  assert.deepEqual([...TIERS], nodeProps.provenance.properties.tier.enum);
  assert.equal(SCHEMA_VERSION, schemaObj.schemaVersion);
  assert.equal(SCHEMA_REVISION, schemaObj.schemaRevision);
});

test("outline order + worst-token table are the recorded rulings", () => {
  assert.deepEqual([...OUTLINE_WORST_ORDER],
    ["red", "amber", "blue", "definition", "lemma", "none", "green"]);
  assert.deepEqual([...OUTLINE_WORST_ORDER], schemaObj.outlineWorstOrder);
  assert.deepEqual(WORST_TO_STATUS, schemaObj.worstTokenToStatus);
  // ruling 1: definition -> blue (NOT green)
  assert.equal(WORST_TO_STATUS.definition, "blue");
});

test("rankWorstToken: recognized ranks are positional; unrecognized ranks WORST", () => {
  OUTLINE_WORST_ORDER.forEach((token, i) => {
    assert.deepEqual(rankWorstToken(token), { rank: i, recognized: true });
  });
  for (const garbage of ["none/green", "", "NONE", "verde", "🟢"]) {
    assert.deepEqual(rankWorstToken(garbage), { rank: -1, recognized: false },
      `unrecognized token ${JSON.stringify(garbage)} must rank WORST`);
  }
});

test("worstOfVerdict agrees with the shared verdict-case table", () => {
  for (const [worstOf, wantToken, wantStatus, wantUnrec] of VERDICT_CASES) {
    assert.deepEqual(worstOfVerdict(worstOf),
      { worstToken: wantToken, status: wantStatus, unrecognized: wantUnrec },
      `worstOf=${JSON.stringify(worstOf)}`);
  }
});

test("unresolved placeholder helpers", () => {
  assert.equal(UNRESOLVED_PLACEHOLDER_PREFIX, schemaObj.unresolvedPlaceholder.prefix);
  assert.ok(isUnresolvedPlaceholder("unresolved:η_helper"));
  assert.ok(!isUnresolvedPlaceholder("n_" + "0".repeat(16)));
});
