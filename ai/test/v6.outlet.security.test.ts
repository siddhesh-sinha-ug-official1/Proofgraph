// ============================================================================
// V6 connector test — SECURITY block (split from test/v6.outlet.test.ts,
// SUB200 restructure; fixtures in v6.outlet.fixtures.ts, assertions verbatim):
// planted-secret negative control THROUGH the outlet path; masterSecret
// required (dev default refused at the wall); REPORT-V6.md free of key
// material.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAiOutlet } from "../service.ts";
import {
  createByokWall, INSECURE_DEV_MASTER_SECRET, WallRefusal,
} from "../../packages/byok-arena/src/wall.ts";
import { makeFakeFetch } from "../../packages/byok-arena/src/testkit/fakefetch.ts";
import {
  API_KEY, MASTER_SECRET, MODEL,
  lastWallPayload, makeGraph, makeProvenance, makeWall, v6Routes,
} from "./v6.outlet.fixtures.ts";
import type { WireCapture } from "./v6.outlet.fixtures.ts";

// ---------------------------------------------------------------------------
// 2. planted-secret NEGATIVE CONTROL through the outlet path
// ---------------------------------------------------------------------------

test("V6 negative control: a key planted in the QUESTION is caught by wall.pins leak scan; outlet pins stay key-free", async () => {
  const plantedKey = "sk-ant-api03-v6-negctl-zulu-3344";
  const wire: WireCapture = { chatBodies: [], submitBodies: [] };
  const wall = makeWall(makeFakeFetch(v6Routes(wire)));
  const outlet = createAiOutlet({ byokWall: wall, graph: makeGraph(), provenance: makeProvenance() });

  // the plant travels as ordinary user text THROUGH the outlet into the wall —
  // it lands in non-redacted adapter probe payloads (chat.input / msgReshape)
  const res = await outlet.ask(`please echo my key ${plantedKey}`, { apiKey: plantedKey, model: MODEL });

  const scan = wall.pins.runSecretLeakScan();
  assert.equal(scan.rawKeyFound, true,
    "a scanner that cannot find a plant driven through the outlet proves nothing");
  assert.ok(
    scan.leakSites.some((s) => s.where === "probe" && s.secretLast4 === plantedKey.slice(-4)),
    `expected a probe-site leak ending ${plantedKey.slice(-4)}: ${JSON.stringify(scan.leakSites)}`,
  );

  // the outlet's own pin stream held: question stored digest-only, scrub chokepoint live
  const outletPinsJson = JSON.stringify(outlet.pins.history());
  assert.ok(!outletPinsJson.includes(plantedKey), "outlet pins must stay key-free even under the plant");
  assert.ok(!JSON.stringify(res).includes(plantedKey), "ask() return must stay key-free even under the plant");
});

// ---------------------------------------------------------------------------
// 3. masterSecret is REQUIRED — the dev default is refused at the wall
// ---------------------------------------------------------------------------

test("V6 masterSecret gate: dev default / empty / missing refused (insecure-master-secret); proper construction probed accepted", () => {
  for (const bad of [INSECURE_DEV_MASTER_SECRET, "", undefined as unknown as string]) {
    assert.throws(
      () => createByokWall({ masterSecret: bad, fetchImpl: makeFakeFetch([]) }),
      (err: unknown) => err instanceof WallRefusal && err.failureClass === "insecure-master-secret",
      `expected insecure-master-secret refusal for ${JSON.stringify(String(bad).slice(0, 12))}`,
    );
  }
  // the outlet's wall is constructed PROPERLY — the accept branch is on the pin stream
  const wall = makeWall(makeFakeFetch([]));
  const gate = lastWallPayload(wall, "wall.masterSecret.gate");
  assert.equal(gate.accepted, true);
});

// ---------------------------------------------------------------------------
// 7. (d) keys never serialize into the REPORT file either
// ---------------------------------------------------------------------------

test("V6 report hygiene: REPORT-V6.md carries no key material", (t) => {
  const reportPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)), "..", "..", "vessels", "REPORT-V6.md");
  if (!existsSync(reportPath)) {
    t.skip("REPORT-V6.md not written yet — hygiene check re-runs once it exists");
    return;
  }
  const text = readFileSync(reportPath, "utf8");
  for (const secret of [API_KEY, MASTER_SECRET, "sk-ant-api03-v6-negctl-zulu-3344"]) {
    assert.ok(!text.includes(secret), `REPORT-V6.md contains secret material ending ${secret.slice(-4)}`);
  }
});
