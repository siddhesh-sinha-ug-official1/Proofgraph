"""S2 · Lean DOCK — per-file kernel verdict application (fills + probes).

Kernel verdicts → fill: green = kernelAccepted ∧ ¬usesSorry ∧
unexpectedAxioms=[] in an error-free file (origin "checked", source
"lean-kernel:v<ver>:… run=<sha16>"); usesSorry → amber; an error-severity
diagnostic anchored in a decl's span → red; anything unjudged stays unknown —
NEVER green from absence.  unusedHypotheses[] → per-decl probed payloads.

Split from lean_dock.py (SUB200 restructure); lean_dock.py stays the facade.
"""
from __future__ import annotations

from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from .lean_common import STAGE, _pos_to_byte, run_ref
from .lean_verdicts import lean_verdict


def apply_file_verdicts(bus: ProbeBus, path: str, doc: dict, sha: str,
                        exit_code: int, data: bytes,
                        file_decls: list[SchemaNode],
                        modules: dict[str, SchemaNode],
                        by_node: dict[str, str],
                        unused_summary: dict[str, list[str]],
                        cause: ProbeEvent | None) -> None:
    """Apply the driver's verdicts to ONE file's decl nodes (fills + verdict
    probes + unusedHyp payloads), then surface errors anchored OUTSIDE every
    decl span as a red on the file's module node."""
    ver = doc.get("toolchain", {}).get("leanVersion", "?")
    err_positions = [
        (_pos_to_byte(data, e["pos"]["line"], e["pos"]["col"]), e)
        for e in doc.get("errors", []) if e["severity"] == "error"]
    file_has_errors = exit_code != 0 or bool(err_positions)
    # [ASSEMBLY CHANGE REAL-INPUTS] node -> ITS OWN driver decl via
    # the disambiguated assignment (was: raw last-component lookup)
    drv_by_name = {d["name"]: d for d in doc.get("decls", [])}
    for n in sorted(file_decls, key=lambda x: x.span.byteStart):
        d = drv_by_name.get(by_node.get(n.id, ""))
        in_span = [(off, e) for off, e in err_positions
                   if n.span.byteStart <= off < n.span.byteEnd]
        verdict, reason = lean_verdict(d, bool(in_span), file_has_errors)
        src_str = None
        if verdict == "green":
            src_str = (f"lean-kernel:v{ver}:kernelAccepted "
                       f"decl={d['name']} run={run_ref(sha)}")
        elif verdict == "amber":
            src_str = (f"lean-kernel:v{ver}:sorryAx "
                       f"decl={d['name']} run={run_ref(sha)}")
        elif verdict == "red":
            off, e = in_span[0]
            src_str = (f"lean-kernel:v{ver}:elaboration-error"
                       f"@{e['pos']['line']}:{e['pos']['col']} "
                       f"run={run_ref(sha)}")
        if verdict != "unknown":
            n.fill = {"status": verdict, "source": src_str}
            n.origin = "checked"
        bus.emit("extractor.t2.lean.verdict", STAGE, "decision", {
            "nodeId": n.id, "decl": (d or {}).get("name", n.name),
            "verdict": verdict, "origin": n.origin,
            "kernelAccepted": (d or {}).get("kernelAccepted"),
            "usesSorry": (d or {}).get("usesSorry"),
            "unexpectedAxioms": (d or {}).get("unexpectedAxioms"),
            "errorInSpan": bool(in_span), "source": src_str,
            "reason": reason}, cause=cause)
        if d is not None:
            binders = [b["binderName"] for b in d.get("unusedHypotheses", [])]
            bus.emit("extractor.t2.lean.unusedHyp", STAGE, "value", {
                "nodeId": n.id, "decl": d["name"], "binders": binders},
                cause=cause)
            if binders:
                unused_summary[n.name] = binders

    # errors anchored OUTSIDE every decl span (e.g. a failed header
    # import) surface red on the FILE's module node — identifiable at
    # file granularity, and said so.
    outside = [(off, e) for off, e in err_positions
               if not any(dn.span.byteStart <= off < dn.span.byteEnd
                          for dn in file_decls)]
    owner = next((m for m in modules.values() if m.span.file == path), None)
    if outside and owner is not None:
        off, e = outside[0]
        owner.fill = {"status": "red",
                      "source": (f"lean-kernel:v{ver}:file-error"
                                 f"@{e['pos']['line']}:{e['pos']['col']} "
                                 f"run={run_ref(sha)}")}
        owner.origin = "checked"
        bus.emit("extractor.t2.lean.verdict", STAGE, "decision", {
            "nodeId": owner.id, "decl": owner.name, "verdict": "red",
            "origin": owner.origin, "kernelAccepted": None,
            "usesSorry": None, "unexpectedAxioms": None,
            "errorInSpan": True, "source": owner.fill["source"],
            "reason": ("error-severity diagnostic outside every decl "
                       "span (e.g. failed header import) — the file's "
                       "module carries the red")}, cause=cause)
