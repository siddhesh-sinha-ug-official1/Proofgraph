/**
 * App-shell round — unit suite for the shell's pure machinery, the FSSOURCE +
 * SMALL-HELPERS groups (SUB200 wave-2 split of shell.units.test.ts):
 *   - fsSource refusal honesty: hub typed classes pass through VERBATIM
 *     (path-escape!), off-contract 200 bodies are the NAMED fs-shape-mismatch,
 *     transport death is hub-unreachable;
 *   - file icons by extension (explorer) + uri helpers.
 */

import { describe, test, expect, beforeEach } from "vitest";

import { fsList, fsRead, fsWrite, fetchWorkspace, fetchRootsCandidates, postAnalyze, type HttpDo } from "../src/fsSource";
import { GraphSourceError } from "../src/graphSource";
import { fileIcon } from "../src/Explorer";
import { spanFileMatches, pyrightCanonicalUri, languageIdFor } from "../src/uris";
import { resetShellState } from "./helpers/shellProbe";

beforeEach(resetShellState);

const httpDoOf = (handler: (method: string, url: string, body?: unknown) => { status: number; body: unknown }): HttpDo =>
  async (method, url, body) => {
    const r = handler(method, url, body);
    return { status: r.status, bytes: new TextEncoder().encode(JSON.stringify(r.body)) };
  };

describe("fsSource — the contract shapes, refusals verbatim", () => {
  test("PUT /fs/file traversal refusal passes the hub's NAMED path-escape through VERBATIM", async () => {
    const t = httpDoOf((method) => method === "PUT"
      ? { status: 403, body: { failureClass: "path-escape", detail: "path escapes the workspace jail: ../../etc/passwd" } }
      : { status: 404, body: { failureClass: "unknown-endpoint", detail: "?" } });
    let err: GraphSourceError | null = null;
    try { await fsWrite("http://hub.fixture", "../../etc/passwd", "x", t); } catch (e) { err = e as GraphSourceError; }
    expect(err).toBeInstanceOf(GraphSourceError);
    expect(err!.failureClass).toBe("path-escape");
    expect(err!.message).toContain("jail");
  });

  test("workspace-not-open and fs-io-error pass through verbatim too", async () => {
    for (const failureClass of ["workspace-not-open", "fs-io-error"]) {
      const t = httpDoOf(() => ({ status: 409, body: { failureClass, detail: "nope" } }));
      let err: GraphSourceError | null = null;
      try { await fsList("http://hub.fixture", "", t); } catch (e) { err = e as GraphSourceError; }
      expect(err!.failureClass).toBe(failureClass);
    }
  });

  test("a 200 body off the contract shape is the NAMED fs-shape-mismatch (never partial accept)", async () => {
    const t = httpDoOf(() => ({ status: 200, body: { unexpected: true } }));
    for (const call of [
      () => fsList("http://h", "", t),
      () => fsRead("http://h", "a.py", t),
      () => fsWrite("http://h", "a.py", "x", t),
      () => fetchWorkspace("http://h", t),
      () => fetchRootsCandidates("http://h", t),
    ]) {
      let err: GraphSourceError | null = null;
      try { await call(); } catch (e) { err = e as GraphSourceError; }
      expect(err).toBeInstanceOf(GraphSourceError);
      expect(err!.failureClass).toBe("fs-shape-mismatch");
    }
  });

  test("transport death is hub-unreachable; happy shapes parse whole", async () => {
    let err: GraphSourceError | null = null;
    try { await fsList("http://h", "", async () => { throw new Error("ECONNREFUSED"); }); } catch (e) { err = e as GraphSourceError; }
    expect(err!.failureClass).toBe("hub-unreachable");

    const t = httpDoOf((method, url) => {
      const u = new URL(url);
      if (u.pathname === "/fs/list") return { status: 200, body: { entries: [{ name: "moatpkg", kind: "dir", size: null }] } };
      if (u.pathname === "/fs/file" && method === "GET") return { status: 200, body: { path: "a.py", content: "x=1", sha256: "abc" } };
      if (u.pathname === "/fs/file" && method === "PUT") return { status: 200, body: { sha256: "def" } };
      if (u.pathname === "/workspace") return { status: 200, body: { root: "C:/ws", package: "moatpkg", declaredRoots: [], analyzedAt: null, pyrightMode: "none" } };
      if (u.pathname === "/fs/roots-candidates") return { status: 200, body: { candidates: [{ id: "n_1", name: "m.f", kind: "function" }] } };
      if (u.pathname === "/analyze") return { status: 200, body: { ok: true } };
      return { status: 404, body: { failureClass: "unknown-endpoint", detail: u.pathname } };
    });
    expect((await fsList("http://h", "", t))[0]).toEqual({ name: "moatpkg", kind: "dir", size: null });
    expect((await fsRead("http://h", "a.py", t)).content).toBe("x=1");
    expect((await fsWrite("http://h", "a.py", "x=2", t)).sha256).toBe("def");
    expect((await fetchWorkspace("http://h", t)).root).toBe("C:/ws");
    expect((await fetchRootsCandidates("http://h", t))[0].id).toBe("n_1");
    expect((await postAnalyze("http://h", { root: "moatpkg" }, t)).ok).toBe(true);
  });
});

// ── small helpers ────────────────────────────────────────────────────────────

describe("explorer file icons + uri helpers", () => {
  test("icons by extension", () => {
    expect(fileIcon("core.py")).toBe("🐍");
    expect(fileIcon("wall.ts")).toBe("🟦");
    expect(fileIcon("readme.md")).toBe("📄");
    expect(fileIcon("noext")).toBe("·");
  });
  test("span-file remap bound: extractor-relative names match workspace-relative paths by segment suffix", () => {
    expect(spanFileMatches("core.py", "moatpkg/core.py")).toBe(true);
    expect(spanFileMatches("core.py", "core.py")).toBe(true);
    expect(spanFileMatches("core.py", "moatpkg/notcore.py")).toBe(false);
    expect(spanFileMatches("core.py", "moatpkg/xcore.py")).toBe(false); // segment boundary, not substring
  });
  test("pyright-canonical uri: forward slashes, lowercase drive, %3A colon", () => {
    expect(pyrightCanonicalUri("C:\\ws\\fixture", "moatpkg/core.py"))
      .toBe("file:///c%3A/ws/fixture/moatpkg/core.py");
  });
  test("language by extension", () => {
    expect(languageIdFor("a.py")).toBe("python");
    expect(languageIdFor("a.json")).toBe("json");
    expect(languageIdFor("a.txt")).toBe("plaintext");
  });
});
