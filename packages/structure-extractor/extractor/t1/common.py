"""S1 T1 — shared datatypes + helpers for the per-language interpreters.

Split from extract.py (SUB200 restructure); extract.py stays the import
surface (facade — `from extractor.t1 import Anchor` is unchanged).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ..ingest import SourceFile


@dataclass
class Anchor:
    lang: str
    anchor_kind: str          # call | base | import | labelref | cite | include | ref
    target_text: str
    file: str
    byte_start: int
    byte_end: int
    extra: dict = field(default_factory=dict)


@dataclass
class _RawNode:
    kind: str
    capture: str
    name: str          # RAW declared name — feeds the canonical mint preimage
    canonical: str     # display name (Node.name) — per-language qualified form
    start: int
    end: int
    signature: str | None = None
    module: str = ""   # containing module/scope — feeds the canonical mint preimage


def _sig(data: bytes, start: int, end: int) -> str:
    first = data[start:end].split(b"\n", 1)[0].decode("utf8", "replace").strip()
    return first[:120]


def _is_top_level(node, root, lang: str) -> bool:
    p = node.parent
    if p is None or p == root:
        return True
    if lang == "python" and p.type == "decorated_definition" and p.parent == root:
        return True
    if lang in ("c", "cpp"):
        # promoted unless nested inside a function body / another type body
        anc = node.parent
        while anc is not None and anc != root:
            if anc.type in ("function_definition", "compound_statement", "field_declaration_list"):
                return False
            anc = anc.parent
        return True
    return False


def _dotted_module(f: SourceFile, project_root: str) -> str:
    try:
        rel = f.abspath.resolve().relative_to(Path(project_root).resolve())
        parts = list(rel.parts)
        parts[-1] = parts[-1].rsplit(".", 1)[0]
        return ".".join(parts)
    except ValueError:
        return f.abspath.stem


def _first_named(caps: dict, key: str):
    nodes = caps.get(key)
    return min(nodes, key=lambda n: n.start_byte) if nodes else None
