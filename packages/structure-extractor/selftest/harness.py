"""Shared harness for the self-test suite.

Every self-test asserts on PROBE OUTPUT, not just return values (Probe Density
Contract §7).  The helpers here run the cell over fixtures and query its bus.
"""
from __future__ import annotations

import sys
from pathlib import Path

TREE = Path(__file__).resolve().parents[1]
if str(TREE) not in sys.path:
    sys.path.insert(0, str(TREE))

from extractor.capability import CapabilityHandle  # noqa: E402
from extractor.pipeline import ExtractorCell, PipelineConfig  # noqa: E402

FIXTURES = TREE / "fixtures"


def force_tier_g(lang: str) -> CapabilityHandle:
    """The pre-LEAN-DOCK stub answer, pinned: tier G for every language.
    Tests that exercise the G/placeholder path pass this explicitly — since
    the stub now honestly reports lean -> CT (the driver is reachable here),
    G-path assertions must PIN the tier they mean to test rather than
    inheriting it from the environment."""
    return CapabilityHandle(lang, "G", "tree-sitter-floor")
RECORDING = FIXTURES / "pyright" / "richpkg.recorded.json"
RICH_ROOTS = ["richpkg.core", "richpkg.models", "richpkg.dyn", "richpkg.core.alpha"]


def run_skeleton(**overrides) -> ExtractorCell:
    cfg = PipelineConfig(roots=["pkg.a"], python_package="pkg", pyright_mode="none")
    for k, v in overrides.items():
        setattr(cfg, k, v)
    cell = ExtractorCell(cfg)
    cell.run(FIXTURES / "python")
    return cell


def run_rich(**overrides) -> ExtractorCell:
    cfg = PipelineConfig(roots=list(RICH_ROOTS), python_package="richpkg",
                         pyright_mode="recorded", pyright_recording_path=RECORDING)
    for k, v in overrides.items():
        setattr(cfg, k, v)
    cell = ExtractorCell(cfg)
    cell.run(FIXTURES / "pyrich")
    return cell


def run_lang(sub: str, **overrides) -> ExtractorCell:
    cfg = PipelineConfig()
    for k, v in overrides.items():
        setattr(cfg, k, v)
    cell = ExtractorCell(cfg)
    cell.run(FIXTURES / sub)
    return cell


def payloads(cell: ExtractorCell, probe_id: str) -> list:
    return [e.payload for e in cell.bus.events(probeId=probe_id)]


def one_payload(cell: ExtractorCell, probe_id: str):
    ps = payloads(cell, probe_id)
    assert len(ps) >= 1, f"expected at least one {probe_id} event, got none"
    return ps[0]


def assert_trace(history: list[dict], expectations: list[tuple]) -> None:
    """Assert the (probeId, predicate) expectations appear as an ORDERED
    subsequence of the probe stream.  predicate(payload) -> bool or None."""
    i = 0
    for probe_id, predicate, label in expectations:
        while i < len(history):
            ev = history[i]
            i += 1
            if ev["probeId"] == probe_id and (predicate is None or predicate(ev["payload"])):
                break
        else:
            raise AssertionError(
                f"expected-trace line not found in order: {probe_id} ({label})")


def edge_view(cell: ExtractorCell) -> list[dict]:
    """Human-stable view of the edge set: node ids mapped back to names,
    placeholders mapped to the candidate dstName."""
    state = cell.dump()
    name_of = {n["id"]: n["name"] for n in state["nodes"]}
    placeholder_names = {}
    for decisions in state["decisions"].values():
        for d in decisions:
            if d["outcome"] == "unresolved":
                placeholder_names[d["boundDstId"]] = d["candidate"]["dstName"]
    out = []
    for e in state["edges"]:
        dst = name_of.get(e["dstId"]) or f"unresolved:{placeholder_names.get(e['dstId'], '?')}"
        out.append({"kind": e["kind"], "src": name_of.get(e["srcId"], e["srcId"]),
                    "dst": dst, "resolved": e["resolved"], "resolver": e["resolver"],
                    "extractor": e["provenance"]["extractor"],
                    "tier": e["provenance"]["tier"]})
    return sorted(out, key=lambda d: (d["kind"], d["src"], d["dst"]))


def snapshot_render(cell: ExtractorCell) -> str:
    """scip-snapshot-style render: fixture sources re-printed with inline
    `# definition` / `# reference` / `# lead` annotations, diffable as a golden."""
    state = cell.dump()
    name_of = {n["id"]: n["name"] for n in state["nodes"]}
    per_file: dict[str, dict[int, list[str]]] = {}

    def add(file: str, byte_start: int, text: str) -> None:
        per_file.setdefault(file, {}).setdefault(byte_start, []).append(text)

    for n in state["nodes"]:
        add(n["span"]["file"], n["span"]["byteStart"],
            f"definition {n['kind']} {n['name']}")
    for decisions in state["decisions"].values():
        for d in decisions:
            c = d["candidate"]
            span = c["useSiteSpan"]
            note = f" | {d['note']}" if d.get("note") else ""
            if d["outcome"] == "resolved":
                add(span["file"], span["byteStart"],
                    f"reference {c['kind']} -> {name_of.get(d['boundDstId'], '?')} "
                    f"({d['resolver']})")
            elif d["outcome"] == "unresolved":
                add(span["file"], span["byteStart"],
                    f"lead {c['kind']} -> {c['dstName']} [{d['reason']}{note}]")
            else:
                add(span["file"], span["byteStart"],
                    f"rejected {c['kind']} -> {c['dstName']} [{d['reason']}{note}]")

    lines_out: list[str] = []
    sourcesets = state["sourcesets"]
    files = sorted({f for ss in sourcesets.values() for f in ss["files"]})
    for file in files:
        if file not in per_file:
            continue
        lines_out.append(f"==== {file} ====")
        # locate the file bytes via the anchors/nodes' fixture root: files are
        # ingest-root relative; the harness knows the root it ran against.
        abspath = _resolve_fixture_file(file)
        data = abspath.read_bytes() if abspath else b""
        line_starts = _line_starts(data)
        by_line: dict[int, list[str]] = {}
        for byte_start, notes in per_file[file].items():
            ln = _line_of(line_starts, byte_start)
            by_line.setdefault(ln, []).extend(sorted(notes))
        for i, raw in enumerate(data.decode("utf8", "replace").split("\n")):
            lines_out.append(raw)
            for note in by_line.get(i, []):
                lines_out.append(f"# {note}")
    return "\n".join(lines_out) + "\n"


def _resolve_fixture_file(rel: str) -> Path | None:
    for sub in ("python", "pyrich", "lean", "lean_ct", "latex", "typst", "go", "c", "cpp"):
        p = FIXTURES / sub / rel
        if p.exists():
            return p
    return None


def _line_starts(data: bytes) -> list[int]:
    starts = [0]
    for i, b in enumerate(data):
        if b == 0x0A:
            starts.append(i + 1)
    return starts


def _line_of(starts: list[int], off: int) -> int:
    lo = 0
    for i, s in enumerate(starts):
        if s <= off:
            lo = i
        else:
            break
    return lo
