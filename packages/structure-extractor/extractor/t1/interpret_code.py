"""S1 T1 — match interpreters for the CODE languages (python/go/c/cpp/lean):
matches -> (_RawNode[], Anchor[], rejects[]).

Split from extract.py (SUB200 restructure); extract.py stays the facade and
owns the _INTERPRETERS dispatch table.
"""
from __future__ import annotations

from ..ingest import SourceFile
from . import engine
from .common import Anchor, _RawNode, _dotted_module, _first_named, _is_top_level, _sig


def _interpret_python(f: SourceFile, pr, matches, project_root: str):
    data, root = f.data, pr.root
    mod = _dotted_module(f, project_root)
    nodes = [_RawNode("module", "module", mod, mod, 0, len(data))]
    anchors, rejects = [], []
    for _, caps in matches:
        for label, kind in (("definition.function", "function"), ("definition.class", "class")):
            if label in caps:
                d = caps[label][0]
                name_n = _first_named(caps, "name")
                name = engine.node_text(data, name_n)
                if not _is_top_level(d, root, "python"):
                    rejects.append((d.start_byte, d.end_byte, f"nested below top-level ({kind} {name!r})"))
                    continue
                nodes.append(_RawNode(kind, d.type, name, f"{mod}.{name}", d.start_byte, d.end_byte,
                                      _sig(data, d.start_byte, d.end_byte)))
        if "anchor.call" in caps:
            callee = caps["anchor.call"][0]
            extra = {}
            if callee.type == "identifier":
                extra["queryByteOffset"] = callee.start_byte
            elif callee.type == "attribute":
                attr = callee.child_by_field_name("attribute")
                extra["queryByteOffset"] = (attr or callee).start_byte
            else:
                extra["dynamic"] = True
            anchors.append(Anchor("python", "call", engine.node_text(data, callee),
                                  f.path, callee.start_byte, callee.end_byte, extra))
        if "anchor.base" in caps:
            base = caps["anchor.base"][0]
            extra = {}
            if base.type == "identifier":
                extra["queryByteOffset"] = base.start_byte
            elif base.type == "attribute":
                attr = base.child_by_field_name("attribute")
                extra["queryByteOffset"] = (attr or base).start_byte
            anchors.append(Anchor("python", "base", engine.node_text(data, base),
                                  f.path, base.start_byte, base.end_byte, extra))
    for rn in nodes:
        rn.module = mod
    return nodes, anchors, rejects


def _interpret_go(f: SourceFile, pr, matches, project_root: str):
    data, root = f.data, pr.root
    nodes, anchors, rejects = [], [], []
    pkg = f.abspath.stem
    for _, caps in matches:
        if "definition.module" in caps:
            pkg = engine.node_text(data, _first_named(caps, "name"))
    nodes.append(_RawNode("module", "package_clause", pkg, pkg, 0, len(data)))
    for _, caps in matches:
        for label, kind in (("definition.function", "function"), ("definition.decl", "decl")):
            if label in caps:
                d = caps[label][0]
                name = engine.node_text(data, _first_named(caps, "name"))
                if not _is_top_level(d, root, "go"):
                    rejects.append((d.start_byte, d.end_byte, f"nested below top-level ({kind} {name!r})"))
                    continue
                nodes.append(_RawNode(kind, d.type, name, f"{pkg}.{name}", d.start_byte, d.end_byte,
                                      _sig(data, d.start_byte, d.end_byte)))
    for rn in nodes:
        rn.module = pkg
    return nodes, anchors, rejects


def _interpret_c_cpp(lang: str):
    def go(f: SourceFile, pr, matches, project_root: str):
        data, root = f.data, pr.root
        nodes, anchors, rejects = [], [], []
        for _, caps in matches:
            for label, kind in (("definition.function", "function"),
                                ("definition.class", "class"),
                                ("definition.decl", "decl")):
                if label in caps:
                    d = caps[label][0]
                    name = engine.node_text(data, _first_named(caps, "name"))
                    if not _is_top_level(d, root, lang):
                        rejects.append((d.start_byte, d.end_byte,
                                        f"nested below top-level ({kind} {name!r})"))
                        continue
                    nodes.append(_RawNode(kind, d.type, name, name, d.start_byte, d.end_byte,
                                          _sig(data, d.start_byte, d.end_byte)))
        for rn in nodes:
            rn.module = f.abspath.stem   # C/C++: the translation unit is the container
        return nodes, anchors, rejects
    return go


def _interpret_lean(f: SourceFile, pr, matches, project_root: str):
    data = f.data
    stem = f.abspath.stem
    nodes = [_RawNode("module", "module", stem, stem, 0, len(data))]
    anchors, rejects = [], []
    seen_defs: dict[int, _RawNode] = {}
    for _, caps in matches:
        for label, kind in (("definition.decl", "decl"), ("definition.theorem", "theorem"),
                            ("definition.section", "section")):
            if label in caps:
                d = caps[label][0]
                name_n = _first_named(caps, "name")
                # the (identifier) child pattern re-matches per identifier;
                # keep the earliest name per declaration node
                prev = seen_defs.get(d.id)
                if prev is None or name_n.start_byte < prev.start:
                    cand = _RawNode(kind, d.type, engine.node_text(data, name_n),
                                    f"{stem}.{engine.node_text(data, name_n)}",
                                    d.start_byte, d.end_byte,
                                    _sig(data, d.start_byte, d.end_byte))
                    cand.start_name = name_n.start_byte  # type: ignore[attr-defined]
                    if prev is None or name_n.start_byte < getattr(prev, "start_name", 1 << 60):
                        seen_defs[d.id] = cand
        if "anchor.import" in caps:
            imp = caps["anchor.import"][0]
            anchors.append(Anchor("lean", "import", engine.node_text(data, imp),
                                  f.path, imp.start_byte, imp.end_byte))
    nodes.extend(sorted(seen_defs.values(), key=lambda r: r.start))
    for rn in nodes:
        rn.module = stem
    return nodes, anchors, rejects
