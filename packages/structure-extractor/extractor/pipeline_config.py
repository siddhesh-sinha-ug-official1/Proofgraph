"""Pipeline configuration + the dossier's honest gaps (split from pipeline.py,
SUB200 restructure; pipeline.py re-exports both — same import surface)."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .capability import CapabilityHandle

HONEST_GAPS = [
    "A uniform T2 index spanning all 7 languages does NOT exist — SCIP/Joern/CodeQL/"
    "Kythe reach none of Lean/LaTeX/Typst; this cell writes and maintains those "
    "edge extractors itself (it IS the missing uniform-schema emitter).",
    "A code↔document unified graph — nobody builds it; Tree 1's schema is the novel "
    "artifact and this cell is its edge-producing half (leanblueprint's \\uses edges "
    "are human-annotated — a UI, not a source of truth).",
    "T3 as a product for anything but imports/dead-code — a build (rustworkx job); "
    "free wins: Go and Lean forbid import cycles at compile time; Python does not.",
    "Typst T3 is genuinely thin: dangling @ref is a compile error, but no "
    "unused-label detection and no cross-file reference-graph export ship.",
    "Lean proof-dependency graph as a clean maintained artifact — a build that "
    "chases Lean's changing internal API (research-grade).",
    "A permissive, embeddable, turnkey LaTeX cross-reference graph emitter — nearly "
    "a gap: LaTeXML is closest, but the graph is extracted from its XML by hand; "
    "texlab computes the edges but is GPL and LSP-only.",
    "Reachability-based 'unused' is only as complete as the edge set: dynamic "
    "dispatch, reflection, DI and dynamic imports make dead-code claims unsound — "
    "blind spots are logged beside every unused result.",
]


@dataclass
class PipelineConfig:
    roots: list[str] = field(default_factory=list)     # canonical node names for T3
    python_package: str | None = None
    pyright_mode: str = "none"                         # "live" | "recorded" | "record" | "none"
    pyright_recording_path: Path | None = None
    johnson_length_bound: int = 8
    capability_fn: Callable[[str], CapabilityHandle] | None = None
    out_dir: Path | None = None
    exclude_names: tuple[str, ...] = ("__init__.py",)
    pinned_typst_main: str | None = None
    # LEAN-DOCK round: kernel-driver knobs (None -> dock defaults: 300s budget
    # for a cold toolchain; elan shim / $LEAN_EXE / PATH resolution)
    lean_driver_timeout_s: float | None = None
    lean_driver_exe: str | None = None
