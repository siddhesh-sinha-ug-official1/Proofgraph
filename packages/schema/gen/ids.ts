// GENERATED from schema.json idScheme (schemaVersion "v0", schemaRevision "v0.1") by schemagen.py. Do not edit by hand.
// TypeScript port of ids.py — the frozen mint.  MUST byte-agree with ids.py;
// vectors.json is the cross-language golden gate asserted by both test suites.
//
// Hashing: sha256 over the UTF-8 preimage, hex, first 16 chars.  On
// Node the hash comes from node:crypto obtained via process.getBuiltinModule
// (no static import, so bundling this file for the browser stays safe).
// Browser use needs a synchronous sha256-hex provider (e.g. a subtle-crypto
// wrapper or a pure-JS sha256) injected via setSha256Provider() — Node-side
// correctness is what is tested now.

export const US = "\u001f";
export const US_ESCAPED = "\\x1f"; // how the delimiter is spelled in probe payloads
export const NODE_DOMAIN_TAG = "node:v0";
export const EDGE_DOMAIN_TAG = "edge:v0";
export const TRUNCATE = 16;
export const NODE_ID_PREFIX = "n_";
export const EDGE_ID_PREFIX = "e_";

export type Sha256HexFn = (utf8Text: string) => string;

interface NodeCryptoLike {
  createHash(algorithm: string): { update(data: string, encoding: "utf8"): { digest(encoding: "hex"): string } };
}

function nodeBuiltinSha256(text: string): string {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const crypto = proc?.getBuiltinModule?.("node:crypto") as NodeCryptoLike | undefined;
  if (!crypto) {
    throw new Error(
      "ids.ts: no sha256 provider — outside Node, inject one via setSha256Provider() (subtle-crypto wrapper)",
    );
  }
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

let sha256Provider: Sha256HexFn = nodeBuiltinSha256;

/** Escape hatch for non-Node runtimes: inject a synchronous sha256-hex function. */
export function setSha256Provider(fn: Sha256HexFn): void {
  sha256Provider = fn;
}

export function sha256Hex(text: string): string {
  return sha256Provider(text);
}

export function nodePreimage(lang: string, kind: string, canonicalName: string, file: string, path: string): string {
  return [NODE_DOMAIN_TAG, lang, kind, canonicalName, file, path].join(US);
}

export function edgePreimage(kind: string, srcId: string, dstId: string): string {
  return [EDGE_DOMAIN_TAG, kind, srcId, dstId].join(US);
}

export function nodeIdFromPreimage(preimage: string): string {
  return NODE_ID_PREFIX + sha256Hex(preimage).slice(0, TRUNCATE);
}

export function edgeIdFromPreimage(preimage: string): string {
  return EDGE_ID_PREFIX + sha256Hex(preimage).slice(0, TRUNCATE);
}

/** Qualified name: the module IS its name; members are module.member. */
export function canonicalNameFor(moduleName: string, declKind: string, rawName: string): string {
  return declKind === "module" ? moduleName : moduleName + "." + rawName;
}

/** The structural locator path (container chain), e.g. sample::A. */
export function structuralPathFor(moduleName: string, declKind: string, rawName: string): string {
  return declKind === "module" ? moduleName : moduleName + "::" + rawName;
}

export interface NodeIdentity {
  canonicalName: string;
  path: string;
  normalizedSpan: { file: string; path: string };
  preimage: string;
  fullHex: string;
  nodeId: string;
}

/** Pure identity computation — mirror of ids.py compute_node_identity. */
export function computeNodeIdentity(lang: string, kind: string, moduleName: string, rawName: string, file: string): NodeIdentity {
  const canonicalName = canonicalNameFor(moduleName, kind, rawName);
  const path = structuralPathFor(moduleName, kind, rawName);
  const preimage = nodePreimage(lang, kind, canonicalName, file, path);
  const fullHex = sha256Hex(preimage);
  return {
    canonicalName,
    path,
    normalizedSpan: { file, path },
    preimage,
    fullHex,
    nodeId: NODE_ID_PREFIX + fullHex.slice(0, TRUNCATE),
  };
}

export interface EdgeIdentity { preimage: string; fullHex: string; edgeId: string }

/** Mirror of ids.py compute_edge_identity. */
export function computeEdgeIdentity(kind: string, srcId: string, dstId: string): EdgeIdentity {
  const preimage = edgePreimage(kind, srcId, dstId);
  const fullHex = sha256Hex(preimage);
  return { preimage, fullHex, edgeId: EDGE_ID_PREFIX + fullHex.slice(0, TRUNCATE) };
}

export interface Manifest { module: { name: string; file: string; lang?: string }; decls: { kind: string; name: string }[] }

/** Mirror of ids.py ids_from_manifest — the pure re-ingest. */
export function idsFromManifest(manifest: Manifest): string[] {
  const moduleName = manifest.module.name;
  const file = manifest.module.file;
  const lang = manifest.module.lang ?? "python";
  const out = [computeNodeIdentity(lang, "module", moduleName, moduleName, file).nodeId];
  for (const decl of manifest.decls) {
    out.push(computeNodeIdentity(lang, decl.kind, moduleName, decl.name, file).nodeId);
  }
  return out.sort();
}
