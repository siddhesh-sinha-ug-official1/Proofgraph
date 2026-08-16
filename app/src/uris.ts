/**
 * App-shell round — uri + span-file projection helpers (no Monaco imports —
 * safe to load eagerly under jsdom/vitest; the heavy editor module stays lazy).
 */

declare const __MOAT_ABS_DIR__: string | undefined;

/** The bundled-fixture fallback directory (vite define; undefined under vitest). */
export function moatAbsDir(): string {
  return typeof __MOAT_ABS_DIR__ !== "undefined" && __MOAT_ABS_DIR__
    ? __MOAT_ABS_DIR__
    : "/proofgraph/acceptance/fixtures/moatpkg"; // stub-transport fallback only
}

/**
 * pyright-canonical file uri (V2's spike-verified byte-exact form: forward
 * slashes, LOWERCASE drive letter, %3A colon — the editor's uri guard needs
 * equality with what pyright publishes back).
 */
export function pyrightCanonicalUri(absDirOrRoot: string, relPath: string): string {
  let p = `${absDirOrRoot}/${relPath}`.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  p = p.charAt(0).toLowerCase() + p.slice(1);
  return "file:///" + p.replace(":", "%3A");
}

/**
 * D-dedup U9 (round-2026-08-16): recognize .lean as a language id so
 * lean-dock buffers no longer fall through to "plaintext".  Extend by
 * extension only; the hub's capability stream remains the source of truth
 * for whether a live tier actually stands for that language.
 */
export function languageIdFor(relPath: string): string {
  if (relPath.endsWith(".py")) return "python";
  if (relPath.endsWith(".lean")) return "lean";
  if (relPath.endsWith(".json")) return "json";
  return "plaintext";
}

/**
 * Does an extractor-minted span.file (SOURCE-ROOT-relative, e.g. "core.py")
 * denote the workspace-relative open file (e.g. "moatpkg/core.py")? The
 * extractor root may sit anywhere under the workspace root, so the honest
 * check is a path-segment suffix match — the DECLARED span-file-remap bound
 * (logged by the caller), ids and byte spans crossing untouched.
 */
export function spanFileMatches(spanFile: string, relPath: string): boolean {
  const s = spanFile.replace(/\\/g, "/");
  const r = relPath.replace(/\\/g, "/");
  return r === s || r.endsWith(`/${s}`);
}
