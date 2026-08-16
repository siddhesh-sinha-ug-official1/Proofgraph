"""Stage I — Wire + lifecycle: the LSP spine (client side).

Spawns a language server OUT-OF-PROCESS over stdio JSON-RPC (license-safe by
construction — Operating Contract rule 10), negotiates positionEncoding, reads
back ServerCapabilities, manages spawn/crash/restart, and computes cache keys
keyed by (compiler version, content hash, lockfile hash).

Determinism: a reader thread only ENQUEUES messages in pipe order; all probe
emission happens on the caller's thread as messages are consumed, so the
logicalClock order of the probe stream is a pure function of the wire content.

The shim's in-band `$/probe` notifications are re-emitted here onto the bus
(stage "shim"); they are transport, so they do NOT additionally appear as
`capability.probe.msg` events.
"""

from __future__ import annotations

from .spine_wire import (  # noqa: F401  (re-exported public surface)
    EXPECTED_METHODS, ServerCrashed, SpineTimeout, path_to_uri, read_framed,
    shim_argv, uri_to_path, write_framed)
from .spine_client import _ClientCore
from .spine_msgs import _MsgMixin
from .spine_proto import _ProtoMixin


class LspClient(_MsgMixin, _ProtoMixin, _ClientCore):
    """One lifecycle-managed stdio LSP connection.  (SUB200 split: the
    method families live in spine_client/spine_msgs/spine_proto; behavior
    is identical to the original single-file class.)"""


def wire(bus, *, file_ext, server_name, argv, env, root_path, lock_path=None,
         client_encodings=("utf-8", "utf-16"),
         language_id="yaddabinggiberish"):
    """Stage I entry: route → spawn → initialize → readback → degrade map."""
    bus.emit("capability.wire.route", "decision",
             {"fileExt": file_ext, "server": server_name}, stage="wire")
    client = LspClient(bus, argv, env=env, server_name=server_name,
                       lock_path=lock_path, client_encodings=client_encodings,
                       language_id=language_id)
    client.start()
    try:
        client.initialize(root_path)
        client.emit_degrade_map()
    except BaseException:
        # a stalled/failed initialize must not orphan the just-spawned process
        try:
            client.kill()
        except Exception:
            pass
        LspClient._close_pipes(client.proc)
        raise
    return client
