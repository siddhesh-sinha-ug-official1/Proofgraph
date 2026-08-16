/**
 * P3 — human-face component suite, the HONESTY groups (SUB200 wave-2 split of
 * p3.face.test.tsx; shared fixture hoisted VERBATIM to
 * test/helpers/p3fixture.ts).
 *
 * What is proven HERE (component level, per the Phase-3 brief):
 *  3. The overlay is id-safe: ids byte-identical before/after; only
 *     fill/outline change; verdicts minted from a different snapshot are the
 *     NAMED refusal analysis-graph-mismatch (V6's graph-data-stale semantics).
 *  4. analysisSource honesty: typed hub refusals (unknown-endpoint /
 *     no-analysis-computed / no-graph-ingested) are PENDING, a drifted 200
 *     shape is the NAMED analysis-shape-mismatch, transport failure is
 *     hub-unreachable — never a silent empty analysis.
 *  5. graphSource error SURFACES: a hub that is down renders a NAMED banner
 *     (hub-unreachable) through the real <App/>, not a blank page.
 *
 * What is deliberately PENDING (never faked green): the live-hub GET
 * /analysis integration — owned by acceptance/run_demo.py once P3-outerwall's
 * endpoint serves a computed analysis (see the todo at the bottom).
 */

import React from "react";
import { describe, test, expect, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import {
  FN_UNUSED, servedEnvelope, analysisVerdicts, contractAnalysis, httpGetOf,
} from "./helpers/p3fixture";
import { fetchAnalysis, overlayVerdicts, type AnalysisVerdict } from "../src/analysisSource";
import { GraphSourceError } from "../src/graphSource";
import App from "../src/App";

beforeAll(installReactFlowShims);
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────

describe("P3 face — overlay id-safety (graph-data-stale semantics at the view seam)", () => {
  test("ids cross byte-identical; ONLY fill/outline change", () => {
    const env = servedEnvelope();
    const before = JSON.parse(JSON.stringify(env));
    const overlaid = overlayVerdicts(env, analysisVerdicts());
    // input never mutated
    expect(env).toEqual(before);
    // id sets identical
    expect(overlaid.envelope.nodes.map((n) => n.id)).toEqual(env.nodes.map((n) => n.id));
    expect(overlaid.envelope.edges).toBe(env.edges);
    expect(overlaid.envelope.leads).toBe(env.leads);
    // every non-verdict field byte-identical
    for (let i = 0; i < env.nodes.length; i++) {
      const { fill: _f1, outline: _o1, ...restBefore } = env.nodes[i] as Record<string, unknown>;
      const { fill: _f2, outline: _o2, ...restAfter } = overlaid.envelope.nodes[i] as Record<string, unknown>;
      expect(JSON.stringify(restAfter)).toBe(JSON.stringify(restBefore));
    }
  });

  test("verdicts from a DIFFERENT snapshot are the NAMED refusal analysis-graph-mismatch", () => {
    const foreign: Record<string, AnalysisVerdict> = {
      n_ffffffffffffffff: { fill: { status: "green", source: "x" }, outline: null },
    };
    let err: GraphSourceError | null = null;
    try {
      overlayVerdicts(servedEnvelope(), foreign);
    } catch (e) {
      err = e as GraphSourceError;
    }
    expect(err).toBeInstanceOf(GraphSourceError);
    expect(err!.failureClass).toBe("analysis-graph-mismatch");
    expect(err!.message).toContain("n_ffffffffffffffff");
  });
});

describe("P3 face — analysisSource honesty", () => {
  test("typed 'not yet' refusals are PENDING with the hub's verbatim class", async () => {
    for (const failureClass of ["unknown-endpoint", "no-analysis-computed", "no-graph-ingested"]) {
      const res = await fetchAnalysis("http://hub.fixture", httpGetOf({
        "/analysis": { status: failureClass === "unknown-endpoint" ? 404 : 503, body: { failureClass, detail: "not yet" } },
      }));
      expect(res.status).toBe("pending");
      if (res.status === "pending") expect(res.failureClass).toBe(failureClass);
    }
  });

  test("a 200 body off the contract shape is the NAMED analysis-shape-mismatch (never partial accept)", async () => {
    let err: GraphSourceError | null = null;
    try {
      await fetchAnalysis("http://hub.fixture", httpGetOf({
        "/analysis": { status: 200, body: { graph: { nodes: [] }, somethingElse: true } },
      }));
    } catch (e) { err = e as GraphSourceError; }
    expect(err).toBeInstanceOf(GraphSourceError);
    expect(err!.failureClass).toBe("analysis-shape-mismatch");
  });

  test("contract-shaped 200 parses whole; other refusals pass through verbatim; transport death is hub-unreachable", async () => {
    const ok = await fetchAnalysis("http://hub.fixture", httpGetOf({
      "/analysis": { status: 200, body: contractAnalysis() },
    }));
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") {
      expect(Object.keys(ok.analysis.verdicts).length).toBe(6);
      expect((ok.analysis.gapAnalysis as { unused: string[] }).unused).toEqual([FN_UNUSED]);
    }

    let verbatim: GraphSourceError | null = null;
    try {
      await fetchAnalysis("http://hub.fixture", httpGetOf({
        "/analysis": { status: 409, body: { failureClass: "pipeline-busy", detail: "in flight" } },
      }));
    } catch (e) { verbatim = e as GraphSourceError; }
    expect(verbatim!.failureClass).toBe("pipeline-busy");

    let dead: GraphSourceError | null = null;
    try {
      await fetchAnalysis("http://hub.fixture", async () => { throw new Error("ECONNREFUSED"); });
    } catch (e) { dead = e as GraphSourceError; }
    expect(dead!.failureClass).toBe("hub-unreachable");
  });
});

describe("P3 face — error SURFACES through the real App", () => {
  test("hub unreachable renders a NAMED banner, not a blank page", async () => {
    render(
      <App
        hubBase="http://127.0.0.1:1"
        aiBase="http://127.0.0.1:2"
        disableEditor
        httpGet={async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:1"); }}
      />,
    );
    const banners = await screen.findAllByText("hub-unreachable", { exact: false }, { timeout: 5000 });
    expect(banners.length).toBeGreaterThan(0);
    expect(screen.getByText(/python hub\/serve_app\.py/)).toBeTruthy();
  });

  test("App with a healthy fixture transport mounts the graph pane and reports analysis pending honestly", async () => {
    const env = servedEnvelope();
    const routes = {
      "/graph": { status: 200, body: env },
      "/graph/truth": { status: 200, body: env },
      "/analysis": { status: 503, body: { failureClass: "no-analysis-computed", detail: "outer wall not yet run" } },
    };
    render(
      <App hubBase="http://hub.fixture" aiBase="http://127.0.0.1:2" disableEditor httpGet={httpGetOf(routes)} />,
    );
    // SELECTOR ADAPTED for the app-shell round (behavior unchanged): the named
    // class now legitimately surfaces in MORE THAN ONE region (info banner AND
    // the status bar's analysis segment) — findAll, not find.
    const pendingHits = await screen.findAllByText("no-analysis-computed", { exact: false }, { timeout: 5000 });
    expect(pendingHits.length).toBeGreaterThan(0);
    // the status bar declares the pending state, and the census matches.
    // SELECTOR ADAPTED for the UI-1C round (behavior unchanged): the served
    // counts now legitimately render in TWO regions (the canvas stats pill AND
    // the status bar segment) — findAll, not find, same served-fact assertion.
    const countHits = await screen.findAllByText(/6 nodes/, { exact: false }, { timeout: 5000 });
    expect(countHits.length).toBeGreaterThan(0);
    expect(screen.getByText(/pending \(no-analysis-computed\)/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PENDING for the acceptance runner (never faked green here): the LIVE hub's
// GET /analysis serving a COMPUTED analyze() result and these same paints
// rendering from it end-to-end — owned by acceptance/run_demo.py (P3 brief:
// "if /analysis is not yet live when you test, mock its contract shape and
// mark the integration assertion pending — do NOT fake it green").
// ─────────────────────────────────────────────────────────────────────────────
test.todo(
  "PENDING (acceptance runner): live hub GET /analysis -> overlayVerdicts -> GraphView paints, end-to-end against the moatpkg fixture",
);
