"""S4 fill-verdict: the honest ceiling, enforced in code.

Tree 1 attaches NO compiler/kernel, so a real verdict cannot exist: every node
is fill.status="unknown" and unknown != green.  The greenGuard is the place
"green may never be faked" lives as a structural decision, not a comment: it
records that green was not requested, would not be allowed, and WHY (the
branch-not-taken: a real compiler/kernel verdict from Trees 2/3 would allow it).
Any node deviating from the honest ceiling is a fake-green gate failure.
"""
from ..errors import GateFailure
from .s2_node import HONEST_FILL

STAGE = "fill"
WHY = "no compiler/kernel attached in Tree 1"


def green_guard(requested_status, verdict_source_available=False):
    """green is allowed ONLY when a real compiler/kernel verdict source exists."""
    requested_green = requested_status == "green"
    return {
        "requestedGreen": requested_green,
        "allowedGreen": requested_green and verdict_source_available,
        "reason": ("real compiler/kernel verdict present" if verdict_source_available
                   else "no real verdict source"),
    }


def run(cell, ctx, in_ref):
    bus = cell.bus
    counts = {"unknown": 0, "green": 0, "amber": 0, "red": 0, "blue": 0}

    for node in ctx["nodes"]:
        cause = ctx["nodeCreateRefs"][node["id"]]
        assign_ref = bus.emit("graph-model.fill.assign", STAGE, "value",
                              {"nodeId": node["id"], "status": node["fill"]["status"],
                               "source": node["fill"]["source"], "why": WHY},
                              cause=cause)
        bus.emit("graph-model.fill.origin", STAGE, "value",
                 {"nodeId": node["id"], "origin": node["origin"]}, cause=assign_ref)
        guard = green_guard(node["fill"]["status"], verdict_source_available=False)
        bus.emit("graph-model.fill.greenGuard", STAGE, "decision",
                 {"nodeId": node["id"], **guard}, cause=assign_ref)
        bus.emit("graph-model.fill.outline", STAGE, "value",
                 {"nodeId": node["id"], "outline": None,
                  "note": "OUTLINE computed in the final gap-analysis round"},
                 cause=assign_ref)

        counts[node["fill"]["status"]] += 1
        if node["fill"]["status"] == "green" or guard["allowedGreen"]:
            raise GateFailure("fake-green",
                              f"node {node['id']} carries green with no compiler attached")
        if node["fill"] != HONEST_FILL:
            raise GateFailure("fake-green",
                              f"node {node['id']} fill {node['fill']} deviates from the "
                              f"honest ceiling {HONEST_FILL}")
        if node["origin"] == "checked":
            raise GateFailure("fake-green",
                              f"node {node['id']} claims origin=checked but nothing "
                              f"was verified by a compiler in Tree 1")

    bus.emit("graph-model.fill.summary", STAGE, "state",
             {"counts": counts}, cause=in_ref)
    ctx["fill"] = {"counts": counts}
