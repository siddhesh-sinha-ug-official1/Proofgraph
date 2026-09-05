// ============================================================================
// P3 ai server — the browser-face origin allowlist (finding S2, pre-GitHub).
//
// This process holds the api key AND the vault masterSecret (KEY CUSTODY,
// core.ts). It carries no cookies, so the CSRF vector is the browser's ambient
// reach: a page the user visits can make the browser POST /ask to
// 127.0.0.1:<aiport>. The old wildcard `Access-Control-Allow-Origin: *` let
// ANY page read the answer AND drive the key-holding wall.
//
// Fix: a LOOPBACK origin allowlist. The app's own origins are the canonical
// allow set (the vite face on :5199 plus the dev hub/ai/ws ports); but the
// acceptance UI runner serves the app on an EPHEMERAL loopback port
// (acceptance/checks/ui_servers.py), so the rule generalizes to "any http(s)
// origin whose host is a loopback literal" — which still blocks EVERY public
// origin (the browser sets Origin; JS cannot forge it). A request with NO
// Origin (curl, the acceptance runners, server-to-server) is allowed
// unchanged — it is not a cross-origin browser read.
// ============================================================================

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// the app's own canonical dev origins (documentation + the common case); a
// subset of the loopback rule below, listed so the allow set is legible.
const DEV_PORTS = [5199, 8477, 8478, 8479];
export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  ["localhost", "127.0.0.1"].flatMap((h) => DEV_PORTS.map((p) => `http://${h}:${p}`)),
);

function isLoopbackOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false; // malformed origin fails closed
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // URL.hostname strips ipv6 brackets ("[::1]" -> "::1").
  return LOOPBACK_HOSTS.has(url.hostname);
}

/** True when the request may be answered cross-origin. A missing Origin (curl,
 *  the runners, server-to-server) is not a cross-origin browser read — allowed
 *  unchanged. A present origin must be an explicit dev origin or any loopback
 *  origin (the ephemeral-port acceptance UI). */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  // "null" is the serialized opaque origin from file:// pages (RFC 6454).
  // Electron production builds load the renderer via loadFile(), so its
  // fetch/XHR requests carry Origin: null — a first-party caller.
  if (origin === "null") return true;
  return ALLOWED_ORIGINS.has(origin) || isLoopbackOrigin(origin);
}

/** The Access-Control-Allow-Origin value to echo, or null to OMIT it: echo the
 *  exact allowlisted origin; omit for a foreign origin (browser blocks the
 *  read) and for no-Origin (nothing to allow). */
export function acaoFor(origin: string | undefined): string | null {
  return origin && originAllowed(origin) ? origin : null;
}

/** True when a PRESENT Origin is not allowlisted: POST /ask from such a browser
 *  origin is refused 403 cross-origin-denied. No-Origin is never denied. */
export function isForeignOrigin(origin: string | undefined): boolean {
  return !!origin && !originAllowed(origin);
}
