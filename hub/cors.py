"""hub/cors.py — the browser-face origin allowlist (finding S1, pre-GitHub).

The hub serves DIAGNOSTIC/graph data AND the jailed workspace-fs surface
(PUT /fs/file, POST /analyze) on a localhost port.  It carries no cookies and
no credentials, so the CSRF vector is purely the browser's ambient reach: a
page the user visits can make the browser issue cross-origin requests to
127.0.0.1:<hubport>.  The old wildcard `Access-Control-Allow-Origin: *`
let ANY such page read every response, and do_OPTIONS whitelisted PUT/POST
with no origin check — so any website could overwrite workspace files.

Fix: a LOOPBACK origin allowlist.  The app's own origins are the canonical
allow set (the vite human face on :5199 plus the dev hub/ai/ws ports,
defensively); but the acceptance UI runner serves the app on an EPHEMERAL
loopback port (acceptance/checks/ui_servers.py), so the rule generalizes to
"any http(s) origin whose host is a loopback literal" — which still blocks
EVERY public-internet origin (a website the user visits is never a loopback
origin; the browser sets Origin and JS cannot forge it).  A request with NO
Origin (curl, the acceptance runners, server-to-server) is not a cross-origin
browser read at all — it is allowed unchanged.

Two decisions flow from one origin string:
  * acao_for(origin)      -> the Access-Control-Allow-Origin value to echo, or
                             None to OMIT it (omit for a foreign origin so the
                             browser blocks the read; omit for no-Origin —
                             nothing to allow).
  * cross_origin_denied() -> True when a PRESENT origin is not allowlisted; a
                             state-changing verb from such an origin is refused
                             with the named class `cross-origin-denied`.
"""
from __future__ import annotations

from urllib.parse import urlsplit

#: loopback host literals — the only hosts a dev/test app origin ever uses.
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

#: the app's own canonical dev origins (documentation + the common case): the
#: vite face :5199 and the dev hub/ai/ws ports.  A subset of the loopback rule
#: below; listed so the allow set is legible, not to narrow it.
_DEV_PORTS = (5199, 8477, 8478, 8479)
ALLOWED_ORIGINS = frozenset(
    f"http://{host}:{port}"
    for host in ("localhost", "127.0.0.1")
    for port in _DEV_PORTS
)


def _is_loopback_origin(origin: str) -> bool:
    """True if `origin` is a well-formed http(s) origin on a loopback host
    (any port).  Malformed origins fail closed."""
    try:
        parts = urlsplit(origin)
    except ValueError:
        return False
    if parts.scheme not in ("http", "https"):
        return False
    try:
        host = parts.hostname          # lowercased; ipv6 brackets stripped
    except ValueError:
        return False
    return host in _LOOPBACK_HOSTS


def origin_allowed(origin: str | None) -> bool:
    """True when the request may be answered cross-origin.  A missing/empty
    Origin (curl, the runners, server-to-server) is NOT a cross-origin browser
    read — allowed unchanged.  A present origin must be on the allowlist
    (an explicit dev origin, or any loopback origin for the ephemeral-port
    acceptance UI)."""
    if not origin:
        return True
    return origin in ALLOWED_ORIGINS or _is_loopback_origin(origin)


def acao_for(origin: str | None) -> str | None:
    """The Access-Control-Allow-Origin header value to echo, or None to omit
    it.  Echo the exact origin for an allowlisted browser origin; omit for a
    foreign origin (browser then blocks the read) and for no-Origin (nothing
    to allow — same-origin/curl needs no header)."""
    if origin and origin_allowed(origin):
        return origin
    return None


def cross_origin_denied(origin: str | None) -> bool:
    """True when a PRESENT Origin is not allowlisted: a state-changing verb
    (PUT /fs/file, POST /analyze) from such a browser origin is refused with
    the named class `cross-origin-denied`.  No-Origin is never denied."""
    return bool(origin) and not origin_allowed(origin)
