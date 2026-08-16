/**
 * SUB200 restructure (wave 2) — shared fixture + render/menu helpers for the
 * shell.face.* component suites, hoisted VERBATIM from shell.face.test.tsx
 * (App-shell round; the hub's workspace-fs endpoints MOCKED at exactly the
 * APP-SHELL-CONTRACT shapes).
 */

import React from "react";
import { expect } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

import App from "../../src/App";
import type { HttpDo } from "../../src/fsSource";
import type { CanonicalEnvelope } from "../../src/graphSource";
import type { TabsStore } from "../../src/tabsStore";
import type { JoinedBus } from "../../src/busAdapter";

export const FN_MAIN = "n_1a1a1a1a1a1a1a1a";

function mkNode(id: string, kind: "module" | "function", name: string, file: string, byteStart: number) {
  return {
    id, kind, lang: "python", name,
    signature: kind === "function" ? `def ${name}()` : null,
    span: { file, byteStart, byteEnd: byteStart + 40 },
    fill: { status: "unknown", source: "" },
    outline: null,
    origin: "checked",
    provenance: { tier: "T1", extractor: "structure-extractor@shell-fixture", resolved: true },
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
      provenance: { tier: "T2", extractor: "structure-extractor@shell-fixture" },
    }],
    leads: [],
  } as unknown as CanonicalEnvelope;
}

export const SCHEMA_HASH = "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c";
export const CORE_CONTENT = "def main():\n    return used_fn()\n";

export interface Call { method: string; path: string; query: Record<string, string>; body: unknown }

/** Full-fidelity mock hub at the contract shapes; records every call.
 *  workspaceState is MUTABLE — a test can call setWorkspace() to change what
 *  GET /workspace returns after e.g. an Open Folder POST /analyze, exactly
 *  as the real hub re-declares the workspace on that path. */
export function mockHub(overrides?: {
  put?: (body: unknown) => { status: number; body: unknown };
  workspace?: { root?: string; package?: string | null; pyrightMode?: string | null };
}): { httpDo: HttpDo; calls: Call[]; setWorkspace: (patch: { root?: string; package?: string | null; pyrightMode?: string | null }) => void } {
  const calls: Call[] = [];
  const env = servedEnvelope();
  let ws = {
    root: overrides?.workspace?.root ?? "C:/ws/fixture",
    package: overrides?.workspace?.package === undefined ? "moatpkg" : overrides.workspace.package,
    declaredRoots: [] as string[],
    analyzedAt: "2026-07-20T00:00:00Z",
    pyrightMode: overrides?.workspace?.pyrightMode === undefined ? "none" : overrides.workspace.pyrightMode,
  };
  const setWorkspace = (patch: { root?: string; package?: string | null; pyrightMode?: string | null }): void => {
    if (patch.root !== undefined) ws.root = patch.root;
    if (patch.package !== undefined) ws.package = patch.package;
    if (patch.pyrightMode !== undefined) ws.pyrightMode = patch.pyrightMode;
  };
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
        root: ws.root, package: ws.package, declaredRoots: ws.declaredRoots,
        analyzedAt: ws.analyzedAt, pyrightMode: ws.pyrightMode,
      });
      case "GET /fs/list":
        if (query.path === "" || query.path === undefined) {
          return json(200, { entries: [{ name: "moatpkg", kind: "dir", size: null }, { name: "README.md", kind: "file", size: 12 }] });
        }
        if (query.path === "moatpkg") {
          return json(200, { entries: [{ name: "core.py", kind: "file", size: 64 }, { name: "helpers.py", kind: "file", size: 32 }] });
        }
        return json(404, { failureClass: "fs-io-error", detail: `no such dir ${query.path}` });
      case "GET /fs/file": {
        if (query.path === "moatpkg/core.py") return json(200, { path: query.path, content: CORE_CONTENT, sha256: "sha-core-0" });
        if (query.path === "moatpkg/helpers.py") return json(200, { path: query.path, content: "def used_fn():\n    return 1\n", sha256: "sha-help-0" });
        return json(404, { failureClass: "fs-io-error", detail: `no such file ${query.path}` });
      }
      case "PUT /fs/file":
        if (overrides?.put !== undefined) { const r = overrides.put(body); return json(r.status, r.body); }
        return json(200, { sha256: "sha-core-1" });
      case "POST /analyze": return json(200, { ok: true, note: "fixture pipeline re-run" });
      case "GET /fs/roots-candidates": return json(200, {
        candidates: [{ id: FN_MAIN, name: "moatpkg.core.main", kind: "function" }],
      });
      case "GET /pins/history": return json(200, { hub: { events: [{ probeId: "hub.serve.graph", payload: { bytes: 1 } }] }, cells: {} });
      default: return json(404, { failureClass: "unknown-endpoint", detail: `no route ${u.pathname}` });
    }
  };
  return { httpDo, calls, setWorkspace };
}

export const shellTabs = (): TabsStore => (window as unknown as { pgShellTabs: TabsStore }).pgShellTabs;
export const shellBus = (): JoinedBus => (window as unknown as { pgShellBus: JoinedBus }).pgShellBus;

export async function renderShell(opts?: {
  put?: (body: unknown) => { status: number; body: unknown };
  confirmFn?: (m: string) => boolean;
  workspace?: { root?: string; package?: string | null; pyrightMode?: string | null };
}) {
  const hub = mockHub({ put: opts?.put, workspace: opts?.workspace });
  render(
    <App
      hubBase="http://hub.fixture" aiBase="http://127.0.0.1:2"
      disableEditor httpDo={hub.httpDo} confirmFn={opts?.confirmFn}
    />,
  );
  // ready = the initial tab stood up through the mocked hub fs
  await waitFor(() => {
    expect(shellTabs().getSnapshot().activePath).toBe("moatpkg/core.py");
  }, { timeout: 5000 });
  return hub;
}

// SELECTOR ADAPTED for the UI-1C round (behavior unchanged): the 1c header
// hides the full menubar behind the hamburger by default (design spec —
// "hamburger toggles full menubar inline"), so opening a menu first reveals
// the menubar via the hamburger when it is not already shown. The menu
// semantics under test (items, reasons, probes, keyboard nav) are untouched.
export const ensureMenubar = (): void => {
  if (document.querySelector('[role="menubar"]') === null) {
    fireEvent.click(document.querySelector('[data-testid="hamburger"]')!);
  }
};
export const openMenu = (menuId: string): HTMLElement => {
  ensureMenubar();
  fireEvent.click(document.querySelector(`[data-menu="${menuId}"]`)!);
  return document.querySelector(".menu-popup") as HTMLElement;
};
export const menuItem = (itemId: string): HTMLElement =>
  document.querySelector(`[data-item="${itemId}"]`) as HTMLElement;
