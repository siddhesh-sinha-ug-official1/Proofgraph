"""The stubbed grammars (ybg / awk) + the runtime seam that loads them.
Split out SUB200 from treesitter.py (the facade)."""

from __future__ import annotations

import re

from .ts_runtime import TSNode, _LineGrammar, _tok


class YbgGrammar(_LineGrammar):
    name = "tree-sitter-ybg-stub"
    version = "0.1"
    root_type = "source_file"
    node_types = [
        {"type": "source_file", "named": True},
        {"type": "import_statement", "named": True},
        {"type": "let_declaration", "named": True},
        {"type": "function_definition", "named": True},
        {"type": "call_expression", "named": True},
        {"type": "identifier", "named": True},
        {"type": "type_identifier", "named": True},
        {"type": "integer_literal", "named": True},
        {"type": "string_literal", "named": True},
        {"type": "comment", "named": True},
        {"type": "block_end", "named": True},
        {"type": "ERROR", "named": True},
        # named:false entries = exactly the keywords/operators/punctuation
        {"type": "let", "named": False},
        {"type": "fn", "named": False},
        {"type": "import", "named": False},
        {"type": ":", "named": False},
        {"type": "=", "named": False},
        {"type": "->", "named": False},
        {"type": "(", "named": False},
        {"type": ")", "named": False},
        {"type": "{", "named": False},
        {"type": "}", "named": False},
        {"type": ",", "named": False},
    ]
    highlights = {
        "@keyword": ["let", "fn", "import"],
        "@operator": ["=", "->"],
        "@type.builtin": ["Int", "String", "Float", "Ast"],
        "@function.builtin": [],
    }

    LET = re.compile(r"^\s*let\s+(\w+)")
    FN = re.compile(r"^\s*fn\s+(\w+)")
    IMPORT = re.compile(r"^\s*import\s+(\w+)\s*$")
    CALL = re.compile(r"^\s*[\w.]+\(.*\)\s*$")
    IDENT = re.compile(r"^\s*\w+\s*$")

    def classify(self, line, byte0):
        s = line.strip()
        if s.startswith("//"):
            return TSNode("comment", True, byte0,
                          byte0 + len(line.encode("utf-8")), line)
        for pat, type_ in ((self.LET, "let_declaration"),
                           (self.FN, "function_definition"),
                           (self.IMPORT, "import_statement")):
            m = pat.match(line)
            if m:
                node = TSNode(type_, True, byte0, byte0 + len(line.encode("utf-8")),
                              line)
                nm = re.search(r"(?:let|fn|import)\s+(\w+)", line)
                if nm:
                    tm = re.compile(re.escape(nm.group(1))).search(line, nm.start(1))
                    if tm:
                        node.children.append(_tok(line, byte0, tm, "identifier"))
                return node
        if s == "}":
            return TSNode("block_end", True, byte0,
                          byte0 + len(line.encode("utf-8")), line)
        if self.CALL.match(line):
            return TSNode("call_expression", True, byte0,
                          byte0 + len(line.encode("utf-8")), line)
        if self.IDENT.match(line):
            return TSNode("identifier", True, byte0,
                          byte0 + len(line.encode("utf-8")), line)
        return TSNode("ERROR", True, byte0, byte0 + len(line.encode("utf-8")), line)


class AwkGrammar(_LineGrammar):
    name = "tree-sitter-awk-stub"
    version = "0.1"
    root_type = "program"
    node_types = [
        {"type": "program", "named": True},
        {"type": "func_definition", "named": True},
        {"type": "rule", "named": True},
        {"type": "statement", "named": True},
        {"type": "identifier", "named": True},
        {"type": "string", "named": True},
        {"type": "number", "named": True},
        {"type": "block_end", "named": True},
        {"type": "ERROR", "named": True},
        {"type": "function", "named": False},
        {"type": "BEGIN", "named": False},
        {"type": "END", "named": False},
        {"type": "{", "named": False},
        {"type": "}", "named": False},
    ]
    highlights = {
        "@keyword": ["function", "BEGIN", "END", "print"],
        "@operator": ["=", "==", "~"],
        "@type.builtin": [],
        "@function.builtin": ["length", "substr", "split", "printf"],
    }

    FUNC = re.compile(r"^\s*function\s+(\w+)")
    RULE = re.compile(r"^\s*(BEGIN|END|/.*/)\s*\{")

    def classify(self, line, byte0):
        end = byte0 + len(line.encode("utf-8"))
        if self.FUNC.match(line):
            return TSNode("func_definition", True, byte0, end, line)
        if self.RULE.match(line):
            return TSNode("rule", True, byte0, end, line)
        if line.strip() == "}":
            return TSNode("block_end", True, byte0, end, line)
        return TSNode("statement", True, byte0, end, line)


class StubTreeSitterRuntime:
    """The seam. Real wiring later: replace with `tree_sitter.Language` loading."""

    GRAMMARS = {".ybg": YbgGrammar, ".awk": AwkGrammar}

    def load_grammar(self, file_ext):
        cls = self.GRAMMARS.get(file_ext)
        return cls() if cls else None
