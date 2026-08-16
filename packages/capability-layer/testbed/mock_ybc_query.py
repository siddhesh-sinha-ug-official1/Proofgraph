"""mock ybc internals, part 2: repo walking, position->token resolution,
cross-file def/refs queries and the positional-argv parser.  Only ever
imported by mock_ybc.py (the spawned entry)."""

import os
import re

from mock_ybc_lang import byte_col, die, file_symbols, read_lines

def repo_files(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for fn in sorted(filenames):
            if fn.endswith(".ybg"):
                out.append(os.path.join(dirpath, fn))
    return out


def token_at(path, line_no, col):
    """Identifier covering 1-based byte column col on 1-based line line_no."""
    lines = read_lines(path)
    if not (1 <= line_no <= len(lines)):
        return None
    line = lines[line_no - 1]
    # map byte col -> char index
    target = col - 1
    nbytes = 0
    char_index = None
    for idx, ch in enumerate(line):
        w = len(ch.encode("utf-8"))
        if nbytes <= target < nbytes + w:
            char_index = idx
            break
        nbytes += w
    if char_index is None:
        return None
    for m in re.finditer(r'\w+', line):
        if m.start() <= char_index < m.end():
            return m.group(0)
    return None


def find_def(root, name):
    for path in repo_files(root):
        for s in file_symbols(path):
            if s["name"] == name and s["kind"] in ("function", "variable"):
                return {"file": os.path.abspath(path), "line": s["line"], "col": s["col"]}
    return None


def find_refs(root, name):
    refs = []
    pat = re.compile(r'\b%s\b' % re.escape(name))
    for path in repo_files(root):
        for i, line in enumerate(read_lines(path), start=1):
            for m in pat.finditer(line):
                refs.append({"file": os.path.abspath(path), "line": i,
                             "col": byte_col(line, m.start())})
    return refs


def parse_pos_args(args):
    line = col = None
    root = None
    rest = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--line":
            line = int(args[i + 1]); i += 2
        elif a == "--col":
            col = int(args[i + 1]); i += 2
        elif a == "--root":
            root = args[i + 1]; i += 2
        else:
            rest.append(a); i += 1
    if len(rest) != 1:
        die("expected exactly one FILE")
    path = rest[0]
    if root is None:
        root = os.path.dirname(os.path.abspath(path)) or "."
    if line is None or col is None:
        die("--line and --col are required")
    return line, col, root, path
