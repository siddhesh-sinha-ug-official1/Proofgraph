"""S4 T3 helpers: the NetworkX agreement oracle + the DOT/JSON export.

Split from t3.py (SUB200 restructure).  Pure relocation: compute_t3 (t3.py)
calls cross_check() and export_t3() with the same values the inline sections
consumed — same probes, same payloads, same ordering.
"""
from __future__ import annotations

import json
from pathlib import Path

import networkx as nx

from .probe import ProbeBus, ProbeEvent

STAGE = "S4.t3"

CYCLE_COUNT_CAP = 10_000


def _canon_cycle(cycle: list[str]) -> tuple[str, ...]:
    i = cycle.index(min(cycle))
    return tuple(cycle[i:] + cycle[:i])


def cross_check(bus: ProbeBus, ids: list[str], pairs: list[tuple[str, str]],
                root_ids: list[str], sccs_rx: list[tuple[str, ...]],
                cycles_rx: set[tuple[str, ...]], reach_rx: set[str],
                truncated: bool, johnson_length_bound: int,
                cause: ProbeEvent | None) -> tuple[bool, dict, bool]:
    """The NetworkX cross-check (the agreement oracle).  Returns
    (agree, diff_payload, truncated_nx)."""
    ev_nx = bus.emit("extractor.t3.networkx.crosscheck", STAGE, "call",
                     {"lib": "networkx"}, cause=cause)
    ng = nx.DiGraph()
    ng.add_nodes_from(ids)
    ng.add_edges_from(pairs)
    sccs_nx = sorted(tuple(sorted(c)) for c in nx.strongly_connected_components(ng))
    cycles_nx: set[tuple[str, ...]] = set()
    truncated_nx = False
    for c in nx.simple_cycles(ng, length_bound=johnson_length_bound):
        if len(cycles_nx) >= CYCLE_COUNT_CAP:
            truncated_nx = True
            break
        cycles_nx.add(_canon_cycle(list(c)))
    reach_nx: set[str] = set()
    for rid in root_ids:
        reach_nx.add(rid)
        reach_nx |= nx.descendants(ng, rid)

    # Under a hit count cap the two libraries enumerate DIFFERENT subsets in
    # library-specific order — comparing them would produce a spurious
    # disagreement (C13/C15), so the cycle comparison is skipped and says so.
    cycles_comparable = not truncated and not truncated_nx
    comparisons = [("scc", set(sccs_rx), set(sccs_nx)),
                   ("reachable", reach_rx, reach_nx)]
    if cycles_comparable:
        comparisons.insert(1, ("cycle", cycles_rx, cycles_nx))
    diff_rx, diff_nx = [], []
    for label, a, b in comparisons:
        diff_rx += [f"{label}:{v}" for v in sorted(map(str, a - b))]
        diff_nx += [f"{label}:{v}" for v in sorted(map(str, b - a))]
    agree = not diff_rx and not diff_nx
    diff_payload = {"onlyInRustworkx": diff_rx, "onlyInNetworkx": diff_nx}
    if not cycles_comparable:
        diff_payload["cyclesComparison"] = "skipped: count cap hit — subsets not comparable"
    bus.emit("extractor.t3.agreement.diff", STAGE, "decision", {
        "agree": agree, "diff": diff_payload}, cause=ev_nx)
    return agree, diff_payload, truncated_nx


def export_t3(bus: ProbeBus, out_dir: Path | None, ids: list[str],
              pairs: list[tuple[str, str]], name_of: dict[str, str],
              result: dict, cause: ProbeEvent | None) -> None:
    """Serialize the T3 graph (DOT/JSON) — the artifact a later gap-analysis
    round loads — and probe the export."""
    dot_lines = ["digraph t3 {"] + \
        [f'  "{name_of[i]}";' for i in ids] + \
        [f'  "{name_of[a]}" -> "{name_of[b]}";' for a, b in pairs] + ["}"]
    dot = "\n".join(dot_lines)
    path = None
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "t3.dot").write_text(dot, encoding="utf8")
        (out_dir / "t3.json").write_text(json.dumps(result, indent=2, sort_keys=True),
                                         encoding="utf8")
        path = (out_dir / "t3.json").as_posix()
    bus.emit("extractor.t3.export", STAGE, "output", {
        "format": "DOT+JSON", "nodes": len(ids), "edges": len(pairs), "path": path},
        cause=cause)
