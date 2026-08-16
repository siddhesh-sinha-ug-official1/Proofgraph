"""Stub tree-sitter runtime shapes: TSNode / Tree / the shared line-grammar
machinery.  Split out SUB200 from treesitter.py (the facade)."""

from __future__ import annotations


class TSNode:
    __slots__ = ("type", "named", "start_byte", "end_byte", "children", "text")

    def __init__(self, type_, named, start_byte, end_byte, text="", children=None):
        self.type = type_
        self.named = named
        self.start_byte = start_byte
        self.end_byte = end_byte
        self.text = text
        self.children = children or []

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


class Tree:
    def __init__(self, root):
        self.root_node = root

    def count(self, type_):
        return sum(1 for n in self.root_node.walk() if n.type == type_)


def _tok(line_text, line_byte0, m, type_, named=True):
    start = line_byte0 + len(line_text[:m.start()].encode("utf-8"))
    end = line_byte0 + len(line_text[:m.end()].encode("utf-8"))
    return TSNode(type_, named, start, end, m.group(0))


class _LineGrammar:
    """Shared machinery: classify each line into nodes; unknown lines → ERROR."""

    name = "?"
    node_types: list = []
    highlights: dict = {}

    def classify(self, line, byte0):
        raise NotImplementedError

    def parse(self, text: str) -> Tree:
        root = TSNode(self.root_type, True, 0, len(text.encode("utf-8")))
        byte0 = 0
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped:
                node = self.classify(line, byte0)
                if node is not None:
                    root.children.append(node)
            byte0 += len(line.encode("utf-8")) + 1
        return Tree(root)
