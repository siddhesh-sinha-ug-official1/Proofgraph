/**
 * fsSource core (SUB200 split of fsSource.ts — no behavior change): the
 * injectable transport, the JSON leg with verbatim hub-refusal pass-through,
 * and the contract-shape refusal helper. The endpoint functions live in
 * fsSourceApi.ts; fsSource.ts stays the facade with the module's full doc.
 */

import { GraphSourceError } from "./graphSource";

export const FS_SOURCE_VERSION = "fs-source/1.0.0" as const;

/** Injectable transport (tests pass a route-table mock; browsers use fetch). */
export type HttpDo = (
  method: "GET" | "PUT" | "POST",
  url: string,
  body?: unknown,
) => Promise<{ status: number; bytes: Uint8Array }>;

export const defaultHttpDo: HttpDo = async (method, url, body) => {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new GraphSourceError("hub-unreachable",
      `${method} ${url} failed at transport level: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { status: resp.status, bytes: new Uint8Array(await resp.arrayBuffer()) };
};

export async function doJson(
  httpDo: HttpDo, method: "GET" | "PUT" | "POST", url: string, body?: unknown,
): Promise<Record<string, unknown>> {
  let status: number;
  let bytes: Uint8Array;
  try {
    ({ status, bytes } = await httpDo(method, url, body));
  } catch (e) {
    if (e instanceof GraphSourceError) throw e;
    throw new GraphSourceError("hub-unreachable",
      `${method} ${url} failed at transport level: ${e instanceof Error ? e.message : String(e)}`);
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    throw new GraphSourceError("hub-bad-response",
      `${method} ${url} returned unparseable JSON (HTTP ${status})`, { url, status });
  }
  const obj = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (status !== 200) {
    // hub typed refusals pass through VERBATIM — path-escape, workspace-not-open,
    // fs-io-error, unknown-endpoint, pipeline-busy, … — never repackaged.
    const failureClass = typeof obj.failureClass === "string" ? obj.failureClass : "hub-bad-response";
    const detail = typeof obj.detail === "string" ? obj.detail : `HTTP ${status}`;
    throw new GraphSourceError(failureClass, `${method} ${url} -> HTTP ${status}: ${detail}`,
      { url, status, hubBody: obj });
  }
  return obj;
}

export function shapeRefusal(url: string, want: string, got: Record<string, unknown>): GraphSourceError {
  return new GraphSourceError("fs-shape-mismatch",
    `${url}: 200 body does not match the APP-SHELL-CONTRACT shape ${want} — refused whole, never partially accepted`,
    { url, keys: Object.keys(got) });
}
