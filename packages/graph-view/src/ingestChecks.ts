/**
 * S0 — INGEST record checkers: per-field shape + enum validation for nodes and
 * edges against the Frozen Schema. Pure functions — no probes here; ingest.ts
 * turns each FieldIssue into its probed branch + rejection. Split from
 * ingest.ts (SUB200 restructure).
 */

import {
  EDGE_KINDS, LANGS, NODE_KINDS, ORIGINS, TIERS, VERDICT_STATUSES,
  type SchemaEdge, type SchemaNode,
} from "./schema";

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface FieldIssue { field: string; kind: "missing" | "enum"; value?: unknown }

export function checkNode(raw: unknown): { ok: true; node: SchemaNode } | { ok: false; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  if (!isObj(raw)) return { ok: false, issues: [{ field: "(record)", kind: "missing" }] };
  const miss = (f: string) => issues.push({ field: f, kind: "missing" });
  const bad = (f: string, v: unknown) => issues.push({ field: f, kind: "enum", value: v });

  if (typeof raw.id !== "string" || raw.id === "") miss("id");
  if (typeof raw.kind !== "string") miss("kind");
  else if (!(NODE_KINDS as readonly string[]).includes(raw.kind)) bad("kind", raw.kind);
  if (typeof raw.lang !== "string") miss("lang");
  else if (!(LANGS as readonly string[]).includes(raw.lang)) bad("lang", raw.lang);
  if (typeof raw.name !== "string") miss("name");
  if (!("signature" in raw) || (raw.signature !== null && typeof raw.signature !== "string")) miss("signature");
  const span = raw.span;
  if (!isObj(span) || typeof span.file !== "string" || typeof span.byteStart !== "number" || typeof span.byteEnd !== "number") miss("span");
  const fill = raw.fill;
  if (!isObj(fill) || typeof fill.source !== "string") miss("fill");
  else if (typeof fill.status !== "string" || !(VERDICT_STATUSES as readonly string[]).includes(fill.status)) bad("fill.status", isObj(fill) ? fill.status : undefined);
  const outline = raw.outline;
  if (!("outline" in raw)) miss("outline");
  else if (outline !== null) {
    if (!isObj(outline) || !Array.isArray(outline.worstOf)) miss("outline");
    else if (typeof outline.status !== "string" || !(VERDICT_STATUSES as readonly string[]).includes(outline.status)) bad("outline.status", outline.status);
  }
  if (typeof raw.origin !== "string") miss("origin");
  else if (!(ORIGINS as readonly string[]).includes(raw.origin)) bad("origin", raw.origin);
  const prov = raw.provenance;
  if (!isObj(prov) || typeof prov.extractor !== "string" || typeof prov.resolved !== "boolean") miss("provenance");
  else if (typeof prov.tier !== "string" || !(TIERS as readonly string[]).includes(prov.tier)) bad("provenance.tier", prov.tier);

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, node: raw as unknown as SchemaNode };
}

export function checkEdge(raw: unknown): { ok: true; edge: SchemaEdge } | { ok: false; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  if (!isObj(raw)) return { ok: false, issues: [{ field: "(record)", kind: "missing" }] };
  const miss = (f: string) => issues.push({ field: f, kind: "missing" });
  const bad = (f: string, v: unknown) => issues.push({ field: f, kind: "enum", value: v });

  if (typeof raw.id !== "string" || raw.id === "") miss("id");
  if (typeof raw.kind !== "string") miss("kind");
  else if (!(EDGE_KINDS as readonly string[]).includes(raw.kind)) bad("kind", raw.kind);
  if (typeof raw.srcId !== "string" || raw.srcId === "") miss("srcId");
  if (typeof raw.dstId !== "string" || raw.dstId === "") miss("dstId");
  if (typeof raw.resolved !== "boolean") miss("resolved");
  if (typeof raw.resolver !== "string") miss("resolver");
  const prov = raw.provenance;
  if (!isObj(prov) || typeof prov.extractor !== "string") miss("provenance");
  else if (typeof prov.tier !== "string" || !(TIERS as readonly string[]).includes(prov.tier)) bad("provenance.tier", prov.tier);

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, edge: raw as unknown as SchemaEdge };
}
