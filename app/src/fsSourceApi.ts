/**
 * fsSource endpoints (SUB200 split of fsSource.ts — no behavior change): the
 * contract endpoint functions over the hub's workspace-fs surface. The fs
 * read/write endpoints (fetchWorkspace, fsList, fsRead, fsWrite,
 * fetchRootsCandidates) are shape-gated (fs-shape-mismatch — refused whole);
 * postAnalyze and fetchPinsHistory return the 200 JSON object as-is, and
 * fetchHealth maps missing/malformed fields to nulls rather than refusing
 * (adversarial-round doc fix: the old header said ALL endpoints were gated).
 * Transport + doJson live in fsSourceCore.ts; fsSource.ts stays the facade.
 */

import { defaultHttpDo, doJson, shapeRefusal, type HttpDo } from "./fsSourceCore";

// ── /workspace ───────────────────────────────────────────────────────────────

export interface WorkspaceInfo {
  root: string;
  package: string | null;
  declaredRoots: string[];
  analyzedAt: string | null;
  pyrightMode: string | null;
}

export async function fetchWorkspace(base: string, httpDo: HttpDo = defaultHttpDo): Promise<WorkspaceInfo> {
  const url = `${base}/workspace`;
  const b = await doJson(httpDo, "GET", url);
  if (typeof b.root !== "string") throw shapeRefusal(url, "{root, package, declaredRoots, analyzedAt, pyrightMode}", b);
  return {
    root: b.root,
    package: typeof b.package === "string" ? b.package : null,
    declaredRoots: Array.isArray(b.declaredRoots) ? b.declaredRoots.map(String) : [],
    // hub serves analyzedAt as a time_ns INT (REPORT-appshell-hubfs) — carried
    // as its decimal string via String(number) (JSON.parse already made it a
    // float64, so ints past 2^53 arrive rounded — display-only, no id rides
    // on it); a string passes through untouched.
    analyzedAt: typeof b.analyzedAt === "string" ? b.analyzedAt
      : typeof b.analyzedAt === "number" ? String(b.analyzedAt) : null,
    pyrightMode: typeof b.pyrightMode === "string" ? b.pyrightMode : null,
  };
}

// ── /fs/list ─────────────────────────────────────────────────────────────────

export interface FsEntry {
  name: string;
  kind: "dir" | "file";
  size: number | null;
}

export async function fsList(base: string, relPath: string, httpDo: HttpDo = defaultHttpDo): Promise<FsEntry[]> {
  const url = `${base}/fs/list?path=${encodeURIComponent(relPath)}`;
  const b = await doJson(httpDo, "GET", url);
  if (!Array.isArray(b.entries)) throw shapeRefusal(url, "{entries:[{name,kind,size}]}", b);
  return (b.entries as Array<Record<string, unknown>>).map((e) => {
    if (typeof e?.name !== "string" || (e.kind !== "dir" && e.kind !== "file")) {
      throw shapeRefusal(url, "{entries:[{name,kind:'dir'|'file',size}]}", b);
    }
    return { name: e.name, kind: e.kind, size: typeof e.size === "number" ? e.size : null };
  });
}

// ── /fs/file (read + save) ───────────────────────────────────────────────────

export interface FsFile {
  path: string;
  content: string;
  sha256: string;
}

export async function fsRead(base: string, relPath: string, httpDo: HttpDo = defaultHttpDo): Promise<FsFile> {
  const url = `${base}/fs/file?path=${encodeURIComponent(relPath)}`;
  const b = await doJson(httpDo, "GET", url);
  if (typeof b.sha256 !== "string") throw shapeRefusal(url, "{path, bytes|content, sha256}", b);
  // contract: bytes as utf8 text (field `bytes` or `content`) or base64.
  let content: string;
  if (typeof b.content === "string") content = b.content;
  else if (typeof b.bytes === "string") {
    content = b.encoding === "base64"
      ? new TextDecoder("utf-8").decode(Uint8Array.from(atob(b.bytes), (c) => c.charCodeAt(0)))
      : b.bytes;
  } else throw shapeRefusal(url, "{path, bytes|content, sha256}", b);
  return { path: typeof b.path === "string" ? b.path : relPath, content, sha256: b.sha256 };
}

export async function fsWrite(
  base: string, relPath: string, content: string, httpDo: HttpDo = defaultHttpDo,
): Promise<{ sha256: string }> {
  const url = `${base}/fs/file`;
  const b = await doJson(httpDo, "PUT", url, { path: relPath, content });
  if (typeof b.sha256 !== "string") throw shapeRefusal(url, "{sha256}", b);
  return { sha256: b.sha256 };
}

// ── /fs/roots-candidates ─────────────────────────────────────────────────────

export interface RootCandidate {
  id: string;
  name: string;
  kind: string;
}

export async function fetchRootsCandidates(base: string, httpDo: HttpDo = defaultHttpDo): Promise<RootCandidate[]> {
  const url = `${base}/fs/roots-candidates`;
  const b = await doJson(httpDo, "GET", url);
  const rows = Array.isArray(b.candidates) ? b.candidates : Array.isArray(b.entries) ? b.entries : null;
  if (rows === null) throw shapeRefusal(url, "{candidates:[{id,name,kind}]}", b);
  return (rows as Array<Record<string, unknown>>).map((c) => {
    if (typeof c?.id !== "string" || typeof c?.name !== "string") {
      throw shapeRefusal(url, "{candidates:[{id,name,kind}]}", b);
    }
    return { id: c.id, name: c.name, kind: typeof c.kind === "string" ? c.kind : "decl" };
  });
}

// ── POST /analyze ────────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  /** hub-side filesystem path of the pipeline root — REQUIRED by the hub
   *  (hub-bad-request without it); the shell resolves it from /workspace. */
  root: string;
  /** declared MODEL roots (decl node ids or unique names) — never inferred */
  roots?: string[];
  /** extractor-wall re-run config, HUB vocabulary: snake_case
   *  {pyright_mode: "live"|"none", python_package?: string} */
  extractorConfig?: Record<string, unknown>;
}

export async function postAnalyze(
  base: string, req: AnalyzeRequest, httpDo: HttpDo = defaultHttpDo,
): Promise<Record<string, unknown>> {
  return doJson(httpDo, "POST", `${base}/analyze`, req);
}

// ── GET /health + /pins/history (status-bar facts come from SERVED data) ─────

export interface HealthInfo {
  schemaPin: { schemaVersion: string; schemaHash: string } | null;
  wallVersions: Record<string, string | null>;
  lspUrl: string | null;
}

export async function fetchHealth(base: string, httpDo: HttpDo = defaultHttpDo): Promise<HealthInfo> {
  const b = await doJson(httpDo, "GET", `${base}/health`);
  const pin = b.schemaPin as Record<string, unknown> | undefined;
  return {
    schemaPin: pin && typeof pin.schemaVersion === "string" && typeof pin.schemaHash === "string"
      ? { schemaVersion: pin.schemaVersion, schemaHash: pin.schemaHash }
      : null,
    wallVersions: (b.wallVersions ?? {}) as Record<string, string | null>,
    lspUrl: typeof (b.lsp as Record<string, unknown> | undefined)?.url === "string"
      ? String((b.lsp as Record<string, unknown>).url)
      : null,
  };
}

export async function fetchPinsHistory(
  base: string, limit: number, httpDo: HttpDo = defaultHttpDo,
): Promise<Record<string, unknown>> {
  return doJson(httpDo, "GET", `${base}/pins/history?limit=${limit}`);
}
