"""S1 — T1 STRUCTURE: uniform tree-sitter extraction for all seven languages.

Emits one Frozen-Schema Node per top-level declaration (§5.5 mapping), plus
relationship-bearing ANCHORS (label_reference, citation, latex_include, typst
ref/import, lean import, python call/base) that seed T2 candidates — anchors
are NOT edges; the language's dock is what resolves them.

SUB200 restructure: this module is now the FACADE.  The shared datatypes
(Anchor, _RawNode) + helpers live in common.py; the per-language match
interpreters in interpret_code.py (python/go/c/cpp/lean) and
interpret_docs.py (latex/typst).  The public surface here is unchanged
(`from extractor.t1 import Anchor, extract_t1` still works).
"""
from __future__ import annotations

from pathlib import Path

from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode, Span, compute_node_identity, US, US_ESCAPED
from ..ingest import SourceSet
from . import engine
from .common import Anchor, _RawNode  # noqa: F401  (facade re-export)
from .interpret_code import (_interpret_c_cpp, _interpret_go, _interpret_lean,
                             _interpret_python)
from .interpret_docs import _interpret_latex, _interpret_typst

STAGE = "S1.t1"

_INTERPRETERS = {
    "python": _interpret_python,
    "go": _interpret_go,
    "c": _interpret_c_cpp("c"),
    "cpp": _interpret_c_cpp("cpp"),
    "lean": _interpret_lean,
    "latex": _interpret_latex,
    "typst": _interpret_typst,
}

_LANG_NODE_PROBE = {lang: f"extractor.t1.node.{lang}" for lang in _INTERPRETERS}


def extract_t1(bus: ProbeBus, sourcesets: dict[str, SourceSet],
               cause: ProbeEvent | None = None) -> tuple[list[SchemaNode], list[Anchor]]:
    """Run T1 over every SourceSet. Returns (schema nodes, T2 anchor seeds)."""
    all_nodes: list[SchemaNode] = []
    all_anchors: list[Anchor] = []
    seen_ids: dict[str, str] = {}   # content-addressed id -> first file that emitted it

    for lang in sorted(sourcesets):
        ss = sourcesets[lang]
        diy = lang in engine.DIY_TAGS
        scm = engine.tags_path(lang)
        bus.emit("extractor.t1.tagsscm.source", STAGE, "value", {
            "lang": lang, "tagsScm": "DIY" if diy else "first-party",
            "path": scm.relative_to(Path(__file__).resolve().parents[2]).as_posix()}, cause=cause)
        if diy:
            captures = sorted({tok for line in scm.read_text().splitlines()
                               for tok in line.split() if tok.startswith("@")})
            bus.emit("extractor.t1.tagsscm.diy.warning", STAGE, "decision", {
                "lang": lang,
                "reason": ("upstream grammar ships thin/no tags.scm — hand-authored capture "
                           "rules; T1 nodes for this lang are lower-confidence"),
                "captures": captures}, cause=cause)

        for f in ss.files:
            ev = bus.emit("extractor.t1.parse.start", STAGE, "input",
                          {"path": f.path, "lang": lang, "byteLen": len(f.data)}, cause=cause)
            bus.emit("extractor.t1.parse.grammar", STAGE, "value", engine.grammar_info(lang), cause=ev)
            pr = engine.parse(lang, f.data)
            for (s, e) in pr.error_spans:
                bus.emit("extractor.t1.parse.error", STAGE, "error",
                         {"path": f.path, "errorNodeSpan": {"byteStart": s, "byteEnd": e}}, cause=ev)
            matches = engine.run_tags(lang, pr.root)
            raw_nodes, anchors, rejects = _INTERPRETERS[lang](f, pr, matches, ss.project_root)

            for (s, e, reason) in rejects:
                bus.emit("extractor.t1.node.reject", STAGE, "node", {
                    "span": {"file": f.path, "byteStart": s, "byteEnd": e},
                    "reason": reason, "lang": lang}, cause=ev)

            count = 0
            for rn in sorted(raw_nodes, key=lambda r: (r.start, r.kind, r.name)):
                # Canonical mint (assembly ruling 5, verified-in-sync with
                # packages/schema/ids.py): the preimage is the STRUCTURAL
                # locator (lang, kind, canonicalName, file, path) — NOT span
                # text — so ids are content-INsensitive to body edits.
                identity = compute_node_identity(lang, rn.kind, rn.module, rn.name, f.path)
                nid = identity["nodeId"]
                preimage = {"lang": lang, "kind": rn.kind,
                            "canonicalName": identity["canonicalName"],
                            "file": f.path, "path": identity["path"],
                            "joined": identity["preimage"].replace(US, US_ESCAPED)}
                if nid in seen_ids:
                    # identical structural identity: one node — but never a
                    # silent drop (review C5): the dedup is probed
                    bus.emit("extractor.t1.node.reject", STAGE, "node", {
                        "span": {"file": f.path, "byteStart": rn.start, "byteEnd": rn.end},
                        "reason": ("duplicate structural node id — same (lang, kind, "
                                   "canonicalName, file, path) already emitted "
                                   f"from {seen_ids[nid]}"),
                        "lang": lang}, cause=ev)
                    continue
                seen_ids[nid] = f.path
                node = SchemaNode(
                    id=nid, kind=rn.kind, lang=lang, name=rn.canonical,
                    signature=rn.signature,
                    span=Span(file=f.path, byteStart=rn.start, byteEnd=rn.end),
                    # provenance.resolved (assembly ruling 7): "the extractor
                    # successfully bound this element's identity" — TRUE for
                    # every well-formed structural node T1 emits.
                    provenance={"tier": "T1", "extractor": "tree-sitter", "resolved": True},
                )
                node.validate()
                payload = {"kind": rn.kind, "lang": lang, "name": rn.canonical,
                           "span": node.span.to_dict(), "signature": rn.signature}
                nev = bus.emit("extractor.t1.node.emit", STAGE, "node", payload, cause=ev)
                lang_payload = {"capture": rn.capture, "kind": rn.kind, "name": rn.canonical,
                                "span": node.span.to_dict()}
                if diy:
                    lang_payload["diyTag"] = True
                if lang == "typst":
                    lang_payload = {"syntaxKind": rn.capture, **{k: v for k, v in lang_payload.items()
                                                                 if k != "capture"}}
                bus.emit(_LANG_NODE_PROBE[lang], STAGE, "node", lang_payload, cause=nev)
                bus.emit("extractor.t1.node.id", STAGE, "value",
                         {"id": nid, "preimage": preimage}, cause=nev)
                bus.emit("extractor.provenance.node.stamp", STAGE, "value", {
                    "nodeId": nid, "tier": "T1", "extractor": "tree-sitter",
                    "resolved": True}, cause=nev)
                all_nodes.append(node)
                count += 1

            for a in sorted(anchors, key=lambda a: (a.byte_start, a.anchor_kind)):
                bus.emit("extractor.t1.anchor.emit", STAGE, "value", {
                    "lang": lang, "anchorKind": a.anchor_kind, "targetText": a.target_text,
                    "useSiteSpan": {"file": a.file, "byteStart": a.byte_start,
                                    "byteEnd": a.byte_end}}, cause=ev)
                all_anchors.append(a)

            bus.emit("extractor.t1.roundtrip.check", STAGE, "value", {
                "path": f.path, "reprintEqualsSource": pr.reprint_equals_source,
                "firstDivergenceByte": pr.first_divergence_byte}, cause=ev)
            bus.emit("extractor.t1.node.count", STAGE, "value",
                     {"lang": lang, "path": f.path, "count": count}, cause=ev)

    return all_nodes, all_anchors
