/**
 * UI-1C POLISH — the cell-5 DOM skin's safety net (styles.css §cell-5 DOM skin).
 *
 * The skin is presentation-level cascade over cell 5's rendered DOM
 * (.react-flow__* + .proof-node — the cell is READ-ONLY). Two guarantees:
 *
 *  1. VERDICT COLORS STAY CANONICAL — app/src restates NONE of the five
 *     verdict hexes (they live only in @graph-view/src/verdict + schema/gen);
 *  2. the skin never overrides the cell's PAINTS — a node's computed fill
 *     (inline background) and ring (inline box-shadow) are byte-identical
 *     with the skin stylesheet ENABLED vs DISABLED, on the cell's real
 *     rendered DOM (GraphView mounted over a wall in jsdom), while a
 *     skin-only property (box-sizing; jsdom can't model !important-over-
 *     inline, so the 9px radius is the live-browser loop's job) IS
 *     applied — proving the sheet is live and still not touching paint.
 */

import React from "react";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

import { createGraphViewWall, type GraphViewWall } from "@graph-view/src/wall";
import { COLORS } from "@graph-view/src/verdict";
import { GraphView } from "@graph-view/src/GraphView";
import type { CanonicalEnvelope } from "../src/graphSource";

// ── the standard React Flow jsdom shims — VERBATIM the cell's own pattern ───
beforeAll(() => {
  class ResizeObserverMock {
    callback: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.callback = cb; }
    observe(target: Element) {
      const contentRect = { x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800 };
      this.callback(
        [{ target, contentRect } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
  class DOMMatrixReadOnlyMock {
    m22: number;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
      this.m22 = scale !== undefined ? +scale : 1;
    }
  }
  (globalThis as Record<string, unknown>).DOMMatrixReadOnly = DOMMatrixReadOnlyMock;
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { get() { return parseFloat((this as HTMLElement).style.height) || 600; }, configurable: true },
    offsetWidth: { get() { return parseFloat((this as HTMLElement).style.width) || 800; }, configurable: true },
  });
  (SVGElement.prototype as unknown as { getBBox: () => object }).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 });
});

afterEach(cleanup);

// vitest runs with the app package as cwd (same move as the build gate test);
// styles.css read via fs — this vitest config resolves `?raw` css to "" (css
// pipeline off in tests), so the import form would silently assert nothing
const SRC_DIR = resolve(process.cwd(), "src");
const stylesCss = readFileSync(join(SRC_DIR, "styles.css"), "utf8");

function srcFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? srcFiles(join(dir, e.name)) : [join(dir, e.name)]);
}

// ── fixture: one node per verdict fill + a green-outline case (contract shape,
// same discipline as shell1c.face) ───────────────────────────────────────────
function mkNode(id: string, name: string, fill: string, outline: string | null) {
  return {
    id, kind: "function", lang: "python", name,
    signature: `def ${name}()`,
    span: { file: "core.py", byteStart: 0, byteEnd: 40 },
    fill: { status: fill, source: fill === "unknown" ? "" : "check" },
    outline,
    origin: "checked",
    provenance: { tier: "T1", extractor: "structure-extractor@skin-fixture", resolved: true },
  };
}

function servedEnvelope(): CanonicalEnvelope {
  return {
    schemaVersion: "v0",
    nodes: [
      mkNode("n_a1a1a1a1a1a1a1a1", "g", "green", "green"),
      mkNode("n_b2b2b2b2b2b2b2b2", "r", "red", "amber"),
      mkNode("n_c3c3c3c3c3c3c3c3", "u", "unknown", null),
    ],
    edges: [{
      id: "e_d4d4d4d4d4d4d4d4", kind: "calls",
      srcId: "n_a1a1a1a1a1a1a1a1", dstId: "n_b2b2b2b2b2b2b2b2",
      resolved: true, resolver: "pyright",
      provenance: { tier: "T2", extractor: "structure-extractor@skin-fixture" },
    }],
    leads: [],
  } as unknown as CanonicalEnvelope;
}

// select-only local bus — same shape v4.serve hands the wall
const busStub = {
  emit: () => {},
  on: () => () => {},
} as never;

describe("shell1c skin — the cell-5 DOM skin never touches verdict paint", () => {
  test("app/src restates ZERO of the five canonical verdict hexes", () => {
    const hexes = ["2E7D32", "F9A825", "C62828", "1565C0", "9E9E9E"];
    const offenders: string[] = [];
    for (const f of srcFiles(SRC_DIR)) {
      const text = readFileSync(f, "utf8").toUpperCase();
      for (const h of hexes) if (text.includes(h)) offenders.push(`${f} contains #${h}`);
    }
    expect(offenders).toEqual([]);
  });

  test("skin sheet enabled vs disabled: node fill + ring computed colors byte-identical; geometry proves the sheet is live", async () => {
    const wall: GraphViewWall = await createGraphViewWall(servedEnvelope(), busStub);
    const { container } = render(
      <div className="app-root" data-theme="dark">
        <GraphView cell={wall.cell} />
      </div>,
    );
    // the cell may CULL off-viewport nodes in jsdom (its own probed decision)
    // — the skin guarantee is per-node, so assert over whatever it mounted
    await waitFor(() => {
      expect(container.querySelectorAll(".proof-node").length).toBeGreaterThan(0);
    });

    // attach the REAL app stylesheet (the skin included) to the document
    const styleEl = document.createElement("style");
    styleEl.textContent = stylesCss;
    document.head.appendChild(styleEl);
    const sheet = styleEl.sheet as CSSStyleSheet;
    expect(sheet).not.toBeNull();

    const mounted = Array.from(container.querySelectorAll<HTMLElement>(".proof-node"));
    const probe = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return {
        background: cs.background || cs.backgroundColor,
        boxShadow: cs.boxShadow,
        boxSizing: cs.boxSizing,
        // the cell's own inline paints, straight off the style attribute
        inlineBackground: el.style.background,
        inlineBoxShadow: el.style.boxShadow,
      };
    };

    const enabled = mounted.map(probe);

    // the sheet IS in effect: the skin's box-sizing lands on the card (a
    // skin-only property — no inline competitor; jsdom's cascade does not
    // model !important-over-inline, so pixel geometry like radius 9px is
    // verified in the live-browser diff loop, not here)
    for (const p of enabled) expect(p.boxSizing).toBe("border-box");

    sheet.disabled = true;
    const disabled = mounted.map(probe);

    // fill + ring: UNCHANGED by the skin (computed AND inline, per node)
    for (let i = 0; i < mounted.length; i++) {
      expect(enabled[i].background).toBe(disabled[i].background);
      expect(enabled[i].boxShadow).toBe(disabled[i].boxShadow);
      expect(enabled[i].inlineBackground).toBe(disabled[i].inlineBackground);
      expect(enabled[i].inlineBoxShadow).toBe(disabled[i].inlineBoxShadow);
    }

    // and those paints ARE canonical: each mounted node's inline fill matches
    // COLORS[its own data-fill-status] (hatch for unknown — never green)
    for (let i = 0; i < mounted.length; i++) {
      const status = mounted[i].getAttribute("data-fill-status") as keyof typeof COLORS | "unknown";
      if (status === "unknown") {
        expect(enabled[i].inlineBackground).toContain("repeating-linear-gradient");
      } else {
        expect(enabled[i].inlineBackground.toUpperCase()).toContain(COLORS[status].toUpperCase());
      }
    }

    styleEl.remove();
    wall.cell.controller.dispose();
  });

  test("the skin block carries no !important on paint-bearing properties (background/box-shadow/fill/stroke)", () => {
    // static guard on the stylesheet itself: within rules that target the
    // cell's DOM, !important may only carry geometry/typography + the accent
    // selection outline — never a paint channel the cell owns.
    const declarationsOnly = stylesCss.replace(/\/\*[\s\S]*?\*\//g, ""); // comments out
    const paintProps = /(background|box-shadow|fill|stroke)[^;{}]*!important/gi;
    expect(declarationsOnly.match(paintProps)).toBeNull();
  });
});
