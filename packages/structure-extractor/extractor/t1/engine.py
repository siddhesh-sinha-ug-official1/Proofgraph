"""T1 engine — the one uniform parser: tree-sitter, all seven languages.

tree-sitter is syntactic and single-file (no cross-file name resolution, no
types) — exactly the T2 gap the docks fill.  This module wraps parsing, tag
query execution, ERROR/MISSING detection, and the byte-exact roundtrip check.
"""
from __future__ import annotations

from dataclasses import dataclass
from importlib import metadata
from pathlib import Path

from tree_sitter import Node, Query, QueryCursor
from tree_sitter_language_pack import get_language, get_parser

TAGS_DIR = Path(__file__).resolve().parent / "tags"

# Which tags.scm are hand-authored (the DIY moat caveat, probed per file).
DIY_TAGS = {"lean", "latex", "typst"}
FIRST_PARTY_TAGS = {"python", "go", "c", "cpp"}


def grammar_info(lang: str) -> dict:
    try:
        pack_ver = metadata.version("tree-sitter-language-pack")
        ts_ver = metadata.version("tree-sitter")
    except metadata.PackageNotFoundError:  # pragma: no cover
        pack_ver = ts_ver = "unknown"
    return {
        "lang": lang,
        "grammar": f"tree-sitter-language-pack:{lang}",
        "grammarVersion": f"pack {pack_ver} / tree-sitter {ts_ver}",
    }


@dataclass
class ParseResult:
    lang: str
    data: bytes
    tree: object
    root: Node
    error_spans: list[tuple[int, int]]        # every ERROR / MISSING node
    reprint_equals_source: bool
    first_divergence_byte: int | None


def _collect_errors(node: Node, out: list[tuple[int, int]]) -> None:
    if node.type == "ERROR" or node.is_missing:
        out.append((node.start_byte, node.end_byte))
    for child in node.children:
        if child.has_error or child.type == "ERROR" or child.is_missing:
            _collect_errors(child, out)


def parse(lang: str, data: bytes) -> ParseResult:
    parser = get_parser(lang)
    tree = parser.parse(data)
    root = tree.root_node
    errors: list[tuple[int, int]] = []
    if root.has_error:
        _collect_errors(root, errors)
    # Roundtrip / lossless reprint: the tree spans the full byte range, so the
    # reprint IS the byte slice the root covers (C1 fixpoint at T1).
    reprint = data[root.start_byte:root.end_byte]
    ok = root.start_byte == 0 and reprint == data
    divergence = None
    if not ok:
        limit = min(len(reprint), len(data))
        divergence = next((i for i in range(limit) if reprint[i] != data[i]), limit)
    return ParseResult(lang=lang, data=data, tree=tree, root=root,
                       error_spans=sorted(set(errors)),
                       reprint_equals_source=ok, first_divergence_byte=divergence)


def tags_path(lang: str) -> Path:
    return TAGS_DIR / f"{lang}.scm"


def run_tags(lang: str, root: Node) -> list[tuple[int, dict[str, list[Node]]]]:
    """Execute the language's tags.scm; returns (pattern_index, {capture: nodes})
    per match, ordered deterministically by match position."""
    query = Query(get_language(lang), tags_path(lang).read_text())
    matches = QueryCursor(query).matches(root)
    def match_key(m):
        _, caps = m
        starts = [n.start_byte for nodes in caps.values() for n in nodes]
        return (min(starts) if starts else 0, m[0])
    return sorted(matches, key=match_key)


def node_text(data: bytes, node: Node) -> str:
    return data[node.start_byte:node.end_byte].decode("utf8", "replace")
