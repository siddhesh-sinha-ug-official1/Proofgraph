"""S1 T1 — match interpreters for the DOCUMENT languages (latex/typst):
matches -> (_RawNode[], Anchor[], rejects[]).

Split from extract.py (SUB200 restructure); extract.py stays the facade and
owns the _INTERPRETERS dispatch table.
"""
from __future__ import annotations

from ..ingest import SourceFile
from . import engine
from .common import Anchor, _RawNode, _first_named, _sig


def _interpret_latex(f: SourceFile, pr, matches, project_root: str):
    data = f.data
    stem = f.abspath.stem
    nodes, anchors, rejects = [], [], []
    theorem_envs: set[str] = set()
    # pass 1: register \newtheorem environment names
    for _, caps in matches:
        if "definition.theoremenv" in caps:
            theorem_envs.add(engine.node_text(data, _first_named(caps, "name")))

    def contained_label(env_node) -> str | None:
        for ch in env_node.children:
            if ch.type == "label_definition":
                for g in ch.children:
                    if g.type == "curly_group_label":
                        for lab in g.children:
                            if lab.type == "label":
                                return engine.node_text(data, lab)
        return None

    for _, caps in matches:
        if "definition.section" in caps:
            d = caps["definition.section"][0]
            name = engine.node_text(data, _first_named(caps, "name"))
            nodes.append(_RawNode("section", d.type, name, f"{stem}:{name}",
                                  d.start_byte, d.end_byte))
        if "definition.label" in caps:
            d = caps["definition.label"][0]
            key = engine.node_text(data, _first_named(caps, "name"))
            nodes.append(_RawNode("label", d.type, key, key, d.start_byte, d.end_byte))
        if "definition.theoremenv" in caps:
            d = caps["definition.theoremenv"][0]
            env = engine.node_text(data, _first_named(caps, "name"))
            nodes.append(_RawNode("theorem", d.type, env, f"{stem}:newtheorem:{env}",
                                  d.start_byte, d.end_byte))
        if "envnode" in caps:
            env_node = caps["envnode"][0]
            env = engine.node_text(data, _first_named(caps, "envname"))
            if env == "figure":
                key = contained_label(env_node) or f"figure@{env_node.start_byte}"
                nodes.append(_RawNode("figure", "generic_environment(figure)", key,
                                      f"{stem}:{key}", env_node.start_byte, env_node.end_byte))
            elif env in theorem_envs:
                key = contained_label(env_node) or f"{env}@{env_node.start_byte}"
                nodes.append(_RawNode("theorem", f"generic_environment({env})", key,
                                      f"{stem}:{key}", env_node.start_byte, env_node.end_byte))
            elif env != "document":
                rejects.append((env_node.start_byte, env_node.end_byte,
                                f"generic environment {env!r} is not a figure/registered theorem env"))
        for cap, akind in (("anchor.labelref", "labelref"), ("anchor.cite", "cite"),
                           ("anchor.include", "include")):
            for n in caps.get(cap, []):
                anchors.append(Anchor("latex", akind, engine.node_text(data, n),
                                      f.path, n.start_byte, n.end_byte))
    for rn in nodes:
        rn.module = stem
    return nodes, anchors, rejects


def _interpret_typst(f: SourceFile, pr, matches, project_root: str):
    data = f.data
    stem = f.abspath.stem
    nodes, anchors, rejects = [], [], []
    # `#let name(args) = body` / `#let name = body`: the (ident) child pattern
    # re-matches per ident (the body of `#let util(x) = x` is also a direct
    # ident child of let) — keep only the EARLIEST ident per let node: that is
    # the binding name, anything later is body, and we say so in the reject.
    let_decls: dict[int, tuple] = {}
    for _, caps in matches:
        if "definition.decl" in caps:
            code_node = caps["definition.decl"][0]
            name_n = _first_named(caps, "name")
            prev = let_decls.get(code_node.id)
            if prev is None or name_n.start_byte < prev[1].start_byte:
                if prev is not None:
                    rejects.append((prev[1].start_byte, prev[1].end_byte,
                                    "ident is a let-body expression, not the binding name"))
                let_decls[code_node.id] = (code_node, name_n)
            else:
                rejects.append((name_n.start_byte, name_n.end_byte,
                                "ident is a let-body expression, not the binding name"))
    for code_node, name_n in sorted(let_decls.values(), key=lambda t: t[0].start_byte):
        name = engine.node_text(data, name_n)
        nodes.append(_RawNode("decl", "let", name, f"{stem}.{name}",
                              code_node.start_byte, code_node.end_byte,
                              _sig(data, code_node.start_byte, code_node.end_byte)))
    for _, caps in matches:
        if "definition.section" in caps:
            heading = caps["definition.section"][0]
            span_node = heading.parent if heading.parent is not None and heading.parent.type == "section" else heading
            name = engine.node_text(data, _first_named(caps, "name")).strip()
            nodes.append(_RawNode("section", "heading", name, f"{stem}:{name}",
                                  span_node.start_byte, span_node.end_byte))
        if "definition.label" in caps:
            lab = caps["definition.label"][0]
            key = data[lab.start_byte + 1:lab.end_byte - 1].decode("utf8", "replace")
            nodes.append(_RawNode("label", "label", key, key, lab.start_byte, lab.end_byte))
        if "callee.name" in caps:
            ident = caps["callee.name"][0]
            callee = engine.node_text(data, ident)
            if callee == "figure":
                outer = ident.parent
                while outer.parent is not None and outer.parent.type == "call":
                    outer = outer.parent
                sib = outer.parent.next_named_sibling if outer.parent is not None else None
                key = None
                if sib is not None and sib.type == "label":
                    key = data[sib.start_byte + 1:sib.end_byte - 1].decode("utf8", "replace")
                name = key or f"figure@{outer.start_byte}"
                nodes.append(_RawNode("figure", "call(figure)", name, f"{stem}:{name}",
                                      outer.start_byte, outer.end_byte))
            else:
                rejects.append((ident.start_byte, ident.end_byte,
                                f"call {callee!r} is not a figure constructor (not promoted)"))
        if "anchor.ref" in caps:
            r = caps["anchor.ref"][0]
            target = data[r.start_byte + 1:r.end_byte].decode("utf8", "replace")
            anchors.append(Anchor("typst", "ref", target, f.path, r.start_byte, r.end_byte))
        if "anchor.importpath" in caps:
            s = caps["anchor.importpath"][0]
            path = engine.node_text(data, s).strip('"')
            anchors.append(Anchor("typst", "import", path, f.path, s.start_byte, s.end_byte))
    for rn in nodes:
        rn.module = stem
    return nodes, anchors, rejects
