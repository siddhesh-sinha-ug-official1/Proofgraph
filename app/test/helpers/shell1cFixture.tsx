/**
 * SUB200 restructure (wave 2) — shared fixture + render/menu helpers for the
 * shell1c.face.* component suites, hoisted VERBATIM from shell1c.face.test.tsx
 * (UI-1C round; the hub's endpoints MOCKED at exactly the contract shapes —
 * the same fixture discipline as shell.face.test.tsx, credited).
 */

import React from "react";
import { expect } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

import App from "../../src/App";
import type { HttpDo } from "../../src/fsSource";
import type { CanonicalEnvelope } from "../../src/graphSource";
import type { TabsStore } from "../../src/tabsStore";

export const FN_MAIN = "n_1a1a1a1a1a1a1a1a";

function mkNode(id: string, kind: "module" | "function", name: string, file: string, byteStart: number) {
  return {
    id, kind, lang: "python", name,
    signature: kind === "function" ? `def ${name}()` : null,
    span: { file, byteStart, byteEnd: byteStart + 40 },
    fill: { status: "unknown", source: "" },
    outline: null,
    origin: "checked",
    provenance: { tier: "T1", extractor: "structure-extractor@shell1c-fixture", resolved: true },
  };
}

export function servedEnvelope(): CanonicalEnvelope {
  return {
    schemaVersion: "v0",
    nodes: [
      mkNode("n_c0c0c0c0c0c0c0c0", "module", "moatpkg.core", "core.py", 0),
      mkNode(FN_MAIN, "function", "moatpkg.core.main", "core.py", 100),
      mkNode("n_4d4d4d4d4d4d4d4d", "function", "moatpkg.helpers.used_fn", "helpers.py", 80),
    ],
    edges: [{
      id: "e_6f6f6f6f6f6f6f6f", kind: "calls", srcId: FN_MAIN, dstId: "n_4d4d4d4d4d4d4d4d",
      resolved: true, resolver: "pyright",
      provenance: { tier: "T2", extractor: "structure-extractor@shell1c-fixture" },
    }],
    leads: [],
  } as unknown as CanonicalEnvelope;
}

export const SCHEMA_HASH = "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c";

export interface Call { method: string; path: string; query: Record<string, string>; body: unknown }

export function mockHub(): { httpDo: HttpDo; calls: Call[] } {
  const calls: Call[] = [];
  const env = servedEnvelope();
  const httpDo: HttpDo = async (method, url, body) => {
    const u = new URL(url);
    const query = Object.fromEntries(u.searchParams.entries());
    calls.push({ method, path: u.pathname, query, body });
    const json = (status: number, obj: unknown) =>
      ({ status, bytes: new TextEncoder().encode(JSON.stringify(obj)) });
    switch (`${method} ${u.pathname}`) {
      case "GET /graph": return json(200, env);
      case "GET /graph/truth": return json(200, env);
      case "GET /analysis": return json(503, { failureClass: "no-analysis-computed", detail: "outer wall not yet run" });
      case "GET /health": return json(200, {
        ok: true, hubVersion: "hub/fixture",
        schemaPin: { schemaVersion: "v0", schemaHash: SCHEMA_HASH },
        wallVersions: { "graph-model": "graph-model-wall/1.0.0" },
        lsp: { url: "ws://127.0.0.1:1/lsp" },
      });
      case "GET /workspace": return json(200, {
        root: "C:/ws/fixture", package: "moatpkg", declaredRoots: [],
        analyzedAt: "2026-07-20T00:00:00Z", pyrightMode: "none",
      });
      case "GET /fs/list":
        if (query.path === "" || query.path === undefined) {
          return json(200, { entries: [{ name: "moatpkg", kind: "dir", size: null }, { name: "README.md", kind: "file", size: 12 }] });
        }
        if (query.path === "moatpkg") {
          return json(200, { entries: [{ name: "core.py", kind: "file", size: 64 }, { name: "helpers.py", kind: "file", size: 32 }] });
        }
        return json(404, { failureClass: "fs-io-error", detail: `no such dir ${query.path}` });
      case "GET /fs/file":
        if (query.path === "moatpkg/core.py") return json(200, { path: query.path, content: "def main():\n    return used_fn()\n", sha256: "sha-core-0" });
        if (query.path === "moatpkg/helpers.py") return json(200, { path: query.path, content: "def used_fn():\n    return 1\n", sha256: "sha-help-0" });
        return json(404, { failureClass: "fs-io-error", detail: `no such file ${query.path}` });
      case "PUT /fs/file": return json(200, { sha256: "sha-core-1" });
      case "POST /analyze": return json(200, { ok: true, note: "fixture pipeline re-run" });
      case "GET /fs/roots-candidates": return json(200, {
        candidates: [{ id: FN_MAIN, name: "moatpkg.core.main", kind: "function" }],
      });
      case "GET /pins/history": return json(200, { hub: { events: [] }, cells: {} });
      default: return json(404, { failureClass: "unknown-endpoint", detail: `no route ${u.pathname}` });
    }
  };
  return { httpDo, calls };
}

export const shellTabs = (): TabsStore => (window as unknown as { pgShellTabs: TabsStore }).pgShellTabs;

export async function renderShell() {
  const hub = mockHub();
  render(<App hubBase="http://hub.fixture" aiBase="http://127.0.0.1:2" disableEditor httpDo={hub.httpDo} />);
  await waitFor(() => {
    expect(shellTabs().getSnapshot().activePath).toBe("moatpkg/core.py");
  }, { timeout: 5000 });
  return hub;
}

export const ensureMenubar = (): void => {
  if (document.querySelector('[role="menubar"]') === null) {
    fireEvent.click(document.querySelector('[data-testid="hamburger"]')!);
  }
};
export const openMenu = (menuId: string): void => {
  ensureMenubar();
  fireEvent.click(document.querySelector(`[data-menu="${menuId}"]`)!);
};
export const menuItem = (itemId: string): HTMLElement =>
  document.querySelector(`[data-item="${itemId}"]`) as HTMLElement;
