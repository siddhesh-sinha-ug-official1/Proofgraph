"""mock ybc internals, part 1: the language subset (regexes), the doc
corpus, io helpers, literal typing, byte columns, per-file symbols and the
tiny REAL type checker.  Only ever imported by mock_ybc.py (the spawned
entry); see its docstring for the language + column-unit contract."""

import re
import sys

LET_RE = re.compile(r'^(\s*)let\s+(\w+)\s*(?::\s*(\w+))?\s*=\s*(.+?)\s*$')
FN_RE = re.compile(r'^(\s*)fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*(\w+)\s*\{\s*$')
IMPORT_RE = re.compile(r'^\s*import\s+(\w+)\s*$')

DOC = {
    "modules": {
        "lib": {"functions": [
            {"name": "parse", "signature": "(s: String) -> Ast",
             "doc": "Parse source text into an Ast."},
            {"name": "render", "signature": "(a: Ast) -> String",
             "doc": "Render an Ast back to source text."},
        ]},
        "util": {"functions": [
            {"name": "helper", "signature": "(a: Int) -> Int",
             "doc": "Identity helper."},
        ]},
    }
}


def die(msg):
    sys.stderr.write("ybc: " + msg + "\n")
    sys.exit(2)


def read_lines(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().split("\n")
    except OSError as e:
        die("cannot read %s: %s" % (path, e))


def literal_type(expr):
    if expr.startswith('"'):
        return "String"
    if re.fullmatch(r'-?\d+', expr):
        return "Int"
    if re.fullmatch(r'-?\d+\.\d+', expr):
        return "Float"
    return None  # identifier / call / other — not a checkable literal


def byte_col(line, char_index):
    """1-based UTF-8 byte offset of character index char_index in line."""
    return len(line[:char_index].encode("utf-8")) + 1


def file_symbols(path):
    """[{name, kind, line, col, type, signature}] — 1-based line, byte col of name."""
    syms = []
    for i, line in enumerate(read_lines(path), start=1):
        m = LET_RE.match(line)
        if m:
            declared, expr = m.group(3), m.group(4)
            t = declared or literal_type(expr) or "Unknown"
            syms.append({"name": m.group(2), "kind": "variable", "line": i,
                         "col": byte_col(line, m.start(2)), "type": t,
                         "signature": None})
            continue
        m = FN_RE.match(line)
        if m:
            sig = "(%s) -> %s" % (m.group(3).strip(), m.group(4))
            syms.append({"name": m.group(2), "kind": "function", "line": i,
                         "col": byte_col(line, m.start(2)), "type": None,
                         "signature": sig})
            continue
        m = IMPORT_RE.match(line)
        if m:
            syms.append({"name": m.group(1), "kind": "import", "line": i,
                         "col": byte_col(line, m.start(1)), "type": None,
                         "signature": None})
    return syms


def check(path):
    diags = []
    for i, line in enumerate(read_lines(path), start=1):
        m = LET_RE.match(line)
        if not m:
            continue
        declared, expr = m.group(3), m.group(4)
        lt = literal_type(expr)
        if declared and lt and declared != lt:
            col = byte_col(line, m.start(4))
            diags.append({
                "line": i,
                "col": col,
                "endCol": col + len(expr.encode("utf-8")),
                "severity": "error",
                "message": "type mismatch: expected %s, found %s" % (declared, lt),
            })
    return diags
