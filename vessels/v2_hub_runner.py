"""v2_hub_runner — the hub process for vessel V2's connector test.

Spawned by vessels/test_v2_squiggle.mjs.  Stands up:

    capability_wall('python')          (cell 2's REAL measured run — battery)
      -> CapabilityLspBackend(wall)    (hub/lsp_backend.py — the V2 seam)
      -> HubServer(None).attach_lsp_backend(backend)  (instance mode)
         .attach_capability_pins(wall.pins)           (T2 quartet on /pins/*)

Protocol: every stdout line is one JSON object.  First line is the ready
line; after that the runner answers stdin commands:

    kill-backend        tree-kill the live LSP child (drop test)
    sessions            [{id, closed, c2s, s2c}] for every bridge session
    audit <i>           HubServer.audit_lsp_session for session i
    session-info <i>    uri/version evidence extracted from session i's ledger
    capability-pins     uri/version evidence from the CELL's own probe stream
                        (capability.probe.msg, stage=bridge)
    shutdown            wall.shutdown() + hub.stop(), prints the shutdown pin

Face-vs-pin discipline (V1's silent-tier-upgrade guard): the ready line only
says ready after the wall's face tier byte-equals the cell's own
capability.probe.measuredTier pin.  No asserted tiers anywhere.

SUB200 restructure: the ledger/pin evidence extractors (_session_info,
_bridge_pins) live in vessels/v2_hub_info.py; this entry point is unchanged.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

VESSELS = Path(__file__).resolve().parent
ROOT = VESSELS.parent

sys.path.insert(0, str(VESSELS))
import pathing  # noqa: E402  (the sanctioned loader; never a bare `import wall`)
from v2_hub_info import _bridge_pins, _session_info  # noqa: E402


def out(obj) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main() -> int:
    capw = pathing.load_wall("capability-layer")

    sys.path.insert(0, str(ROOT / "hub"))
    import pipeline as hub_pipeline  # noqa: E402
    import server as hub_server      # noqa: E402
    import lsp_backend               # noqa: E402

    log = hub_pipeline.HubLog()

    wall = capw.capability_wall("python")
    if isinstance(wall, capw.WallRefusalNotice):
        out({"ready": False, "error": "unknown-language",
             "detail": repr(wall)})
        return 2

    # face-vs-pin: the V1 silent-tier-upgrade guard, re-applied here.
    tier_pins = [e for e in wall.pins.history()
                 if e.get("probeId") == "capability.probe.measuredTier"]
    pin_tier = tier_pins[-1]["payload"]["measuredTier"] if tier_pins else None
    if pin_tier != wall.tier:
        out({"ready": False, "error": "silent-tier-upgrade",
             "faceTier": wall.tier, "pinTier": pin_tier})
        wall.shutdown()
        return 2
    construct = [e for e in wall.pins.history()
                 if e.get("probeId") == "capability.wall.construct"]
    construct_tier = construct[-1]["payload"]["tier"] if construct else None

    try:
        backend = lsp_backend.CapabilityLspBackend(wall, log=log)
    except hub_pipeline.HubError as exc:
        out({"ready": False, "error": exc.failure_class, "detail": str(exc)})
        wall.shutdown()
        return 2

    hub = hub_server.HubServer(None, log=log)
    hub.attach_lsp_backend(backend)   # instance mode: one session at a time
    hub.attach_capability_pins(
        wall.pins, note="V2: T2 quartet aggregated for the LSP bridge run")
    hub.start()

    out({"ready": True, "httpPort": hub.http_port, "wsPort": hub.ws_port,
         "faceTier": wall.tier, "pinTier": pin_tier,
         "constructPinTier": construct_tier, "paperTier": wall.paperTier,
         "handleKind": wall.handle.kind,
         "batteryP2": wall.probeReport.get("p2"),
         "greenAllowed": wall.probeReport.get("greenAllowed")})

    for line in sys.stdin:
        cmd = line.strip().split()
        if not cmd:
            continue
        try:
            if cmd[0] == "kill-backend":
                res = backend.kill_child()
                out({"cmd": "kill-backend", "ok": True, **res})
            elif cmd[0] == "sessions":
                out({"cmd": "sessions", "sessions": [
                    {"id": s.session_id, "closed": s.closed,
                     "c2s": len(s.c2s), "s2c": len(s.s2c)}
                    for s in hub.lsp_sessions]})
            elif cmd[0] == "audit":
                res = hub.audit_lsp_session(
                    hub.lsp_sessions[int(cmd[1])], backend)
                out({"cmd": "audit", **res})
            elif cmd[0] == "session-info":
                out({"cmd": "session-info",
                     **_session_info(hub.lsp_sessions[int(cmd[1])])})
            elif cmd[0] == "capability-pins":
                out({"cmd": "capability-pins", **_bridge_pins(wall)})
            elif cmd[0] == "shutdown":
                wall.shutdown()
                sd = [e for e in wall.pins.history()
                      if e.get("probeId") == "capability.wall.shutdown"]
                hub.stop()
                proc = backend.client.proc
                out({"cmd": "shutdown", "ok": True,
                     "wallShutdownPin": sd[-1]["payload"] if sd else None,
                     "childExitCode": proc.poll() if proc else None})
                return 0
            else:
                out({"cmd": cmd[0], "error": "unknown-command"})
        except Exception as exc:  # noqa: BLE001 — surfaced to the test, typed
            out({"cmd": cmd[0], "error": repr(exc)})
    return 0


if __name__ == "__main__":
    sys.exit(main())
