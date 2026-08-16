"""S0 INGEST — detect language, group SourceSets, find each backend's project
root, consume Tree 2's capability handle, pick the dock (decision D1).

A wrong project root silently truncates the graph, so root detection is an
explicit probed decision, never a silent guess.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .capability import CapabilityHandle, stub_capability
from .probe import ProbeBus, ProbeEvent

EXT_TO_LANG = {
    ".py": "python", ".go": "go", ".c": "c", ".h": "c",
    ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp", ".hh": "cpp",
    ".lean": "lean", ".tex": "latex", ".typ": "typst",
}

SHEBANG_TO_LANG = {"python": "python", "python3": "python"}

STAGE = "S0.ingest"


@dataclass
class SourceFile:
    path: str            # POSIX-relative to the ingest root
    abspath: Path
    lang: str
    data: bytes


@dataclass
class SourceSet:
    lang: str
    files: list[SourceFile] = field(default_factory=list)
    project_root: str = ""
    root_anchor: str = ""          # package | lake-project | main.tex | pinned-main | folder


def detect_lang(path: Path, data: bytes) -> tuple[str | None, str]:
    """Extension first, then shebang, then a content heuristic."""
    ext = path.suffix.lower()
    if ext in EXT_TO_LANG:
        return EXT_TO_LANG[ext], "extension"
    first = data.split(b"\n", 1)[0]
    if first.startswith(b"#!"):
        for key, lang in SHEBANG_TO_LANG.items():
            if key.encode() in first:
                return lang, "shebang"
    if data.lstrip().startswith(b"\\documentclass"):
        return "latex", "content"
    return None, "none"


def _detect_project_root(lang: str, files: list[SourceFile], root: Path,
                         pinned_main: str | None) -> tuple[str, str, str]:
    """Return (project_root, anchor, reason) per backend needs (spec §6.1)."""
    if lang == "python":
        # grimp needs an importable *package*: the anchor is the topmost dir
        # holding an __init__.py; the project root is that dir's parent.
        for f in files:
            p = f.abspath.parent
            top = None
            while (p / "__init__.py").exists():
                top = p
                p = p.parent
            if top is not None:
                return (str(top.parent), "package",
                        f"topmost __init__.py package dir is {top.name!r}; grimp imports from its parent")
        return (str(root), "package", "no __init__.py found — loose modules; grimp root = ingest root")
    if lang == "lean":
        for f in files:
            for parent in [f.abspath.parent, *f.abspath.parents]:
                if (parent / "lakefile.lean").exists() or (parent / "lakefile.toml").exists():
                    return (str(parent), "lake-project", "lakefile found — `lake exe graph` runs here")
        return (str(root), "lake-project",
                "no lakefile found — Lean dock (design-stub) would need a Lake project when live")
    if lang == "latex":
        mains = [f for f in files if f.abspath.name == "main.tex"] or \
                [f for f in files if b"\\documentclass" in f.data]
        if mains:
            return (mains[0].path, "main.tex",
                    f"{mains[0].path} carries \\documentclass — LaTeXML entry point")
        return (str(root), "main.tex", "no \\documentclass found — no LaTeXML entry; graph may truncate")
    if lang == "typst":
        if pinned_main:
            return (pinned_main, "pinned-main", "explicit pinned main (tinymist.pinMain equivalent)")
        mains = [f for f in files if f.abspath.name == "main.typ"] or files
        return (mains[0].path, "pinned-main",
                f"no pin configured — defaulting to {mains[0].path}; cross-file @ref needs a pinned main")
    return (str(root), "folder", "code language with folder-scoped T1 (Go/C/C++ docks deferred)")


DOCKS_AVAILABLE = {"python", "lean", "latex", "typst"}   # python SHIPPED; lean CT-wired
# (kernel driver, LEAN-DOCK round; G placeholder below CT); latex/typst DESIGN/STUB


def ingest(bus: ProbeBus, root: Path, exclude_names: tuple[str, ...] = ("__init__.py",),
           capability_fn: Callable[[str], CapabilityHandle] | None = None,
           pinned_typst_main: str | None = None,
           cause: ProbeEvent | None = None,
           ) -> tuple[dict[str, SourceSet], dict[str, CapabilityHandle], dict[str, str]]:
    """Walk `root`, probe every file, group per-lang SourceSets, resolve the
    capability tier per lang, pick docks. Returns (sourcesets, capabilities, docks)."""
    capability_fn = capability_fn or stub_capability
    root = root.resolve()
    sourcesets: dict[str, SourceSet] = {}
    excluded: list[str] = []

    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(root).as_posix()
        if p.name in exclude_names:
            excluded.append(rel)
            continue
        data = p.read_bytes()
        lang, evidence = detect_lang(p, data)
        ev = bus.emit("extractor.ingest.file", STAGE, "input", {
            "path": rel, "byteLen": len(data),
            "sha": hashlib.sha256(data).hexdigest()[:16]}, cause=cause)
        if lang is None:
            continue
        bus.emit("extractor.ingest.lang.detected", STAGE, "value",
                 {"path": rel, "lang": lang, "evidence": evidence}, cause=ev)
        sourcesets.setdefault(lang, SourceSet(lang=lang)).files.append(
            SourceFile(path=rel, abspath=p, lang=lang, data=data))

    if excluded:
        # A bound is a cap, and caps are logged — never silent (rule 8).
        bus.emit("extractor.cap.applied", STAGE, "decision", {
            "capName": "ingest.exclude-names", "limit": list(exclude_names),
            "actual": len(excluded), "dropped": excluded}, cause=cause)

    capabilities: dict[str, CapabilityHandle] = {}
    docks: dict[str, str] = {}
    for lang in sorted(sourcesets):
        ss = sourcesets[lang]
        proot, anchor, reason = _detect_project_root(lang, ss.files, root, pinned_typst_main)
        ss.project_root, ss.root_anchor = proot, anchor
        bus.emit("extractor.ingest.projectroot.detect", STAGE, "decision",
                 {"lang": lang, "root": proot, "anchor": anchor, "reason": reason}, cause=cause)
        bus.emit("extractor.ingest.sourceset.group", STAGE, "value",
                 {"lang": lang, "files": [f.path for f in ss.files], "projectRoot": proot},
                 cause=cause)
        req = bus.emit("extractor.ingest.capability.request", STAGE, "call", {"lang": lang},
                       cause=cause)
        cap = capability_fn(lang)
        capabilities[lang] = cap
        bus.emit("extractor.ingest.capability.response", STAGE, "call",
                 {"lang": lang, "tier": cap.tier, "handleKind": cap.handle_kind}, cause=req)
        if lang in DOCKS_AVAILABLE:
            dock = lang
            docks[lang] = dock
            bus.emit("extractor.ingest.dock.selected", STAGE, "decision", {
                "lang": lang, "dock": dock,
                "reason": ("shipped dock (grimp+pyright)" if lang == "python"
                           else f"design-stub dock at tier {cap.tier}: emits candidates as leads only")},
                cause=cause)
        else:
            # D1 branch NOT taken: no dock at this tier -> T1-only, and we say so.
            bus.emit("extractor.ingest.dock.unavailable", STAGE, "branch", {
                "lang": lang,
                "reason": (f"no dock for {lang} this round (Go/C/C++ are the deferred "
                           f"SCIP/Joern band, spec §5.7) — falling back to T1-only: "
                           f"structure nodes, zero resolved edges")}, cause=cause)
    return sourcesets, capabilities, docks
