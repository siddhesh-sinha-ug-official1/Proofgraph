#!/usr/bin/env python3
"""mock ybc — stand-in Yaddabinggiberish compiler CLI.

TESTBED, not part of the capability package. It is only ever SPAWNED as an
out-of-process subprocess whose JSON/text is consumed (Operating Contract rule 10) —
exactly how a real `ybc` would be driven. Swapping in a real compiler is a config
change (config["ybc_argv"]).

Language subset understood:
    import NAME
    let NAME: Type = EXPR          (declared)
    let NAME = EXPR                (inferred)
    fn NAME(a: T, b: T) -> T {     (signature)
    // comments, blank lines, bare expressions, closing braces

Semantics implemented (a REAL, tiny type checker — P2 must be earned, not faked):
    * literal typing: "..." -> String, 42 -> Int, 4.2 -> Float
    * declared-vs-literal mismatch  -> error diagnostic
COLUMN UNITS: 1-based UTF-8 BYTE offsets (documented in --help; the shim must convert).
"""

import json
import os
import sys

# SUB200 restructure: this file REMAINS the spawned entry (config ybc_argv
# points at it by path; python puts this directory on sys.path[0], so the
# sibling internals import as plain top-level modules).  CLI surface and
# behavior are unchanged.
from mock_ybc_lang import DOC, check, die, file_symbols  # noqa: E402
from mock_ybc_query import (  # noqa: E402
    find_def, find_refs, parse_pos_args, repo_files, token_at)

VERSION = "1.4.0"

HELP = """ybc %s — the Yaddabinggiberish compiler
USAGE:
  ybc check --format=json FILE          type-check; structured diagnostics on stdout
  ybc check FILE                        type-check; human-readable diagnostics
  ybc query type --line L --col C [--root DIR] FILE    type of the symbol at a position
  ybc query def  --line L --col C [--root DIR] FILE    definition site (cross-file)
  ybc query refs --line L --col C [--root DIR] FILE    all references (cross-file)
  ybc doc --format=json [MODULE]        API docs as json (docstrings + signatures)
  ybc --emit=ast --format=json FILE     typed ast / symbols as json
  ybc dump-symbols FILE                 alias of --emit=ast
  ybc --version
NOTES:
  columns are 1-based UTF-8 byte offsets
  exit 0 with diagnostics on stdout; exit 2 on usage error
""" % VERSION


def main(argv):
    if not argv or argv[0] in ("--help", "-h", "help"):
        sys.stdout.write(HELP)
        return 0
    if argv[0] == "--version":
        sys.stdout.write("ybc %s\n" % VERSION)
        return 0

    if argv[0] == "check":
        args = [a for a in argv[1:]]
        as_json = "--format=json" in args
        files = [a for a in args if not a.startswith("--")]
        if len(files) != 1:
            die("check takes exactly one FILE")
        diags = check(files[0])
        if as_json:
            sys.stdout.write(json.dumps(diags))
        else:
            for d in diags:
                sys.stdout.write("%s:%d:%d: %s: %s\n" % (
                    files[0], d["line"], d["col"], d["severity"], d["message"]))
        return 0

    if argv[0] == "query":
        if len(argv) < 2 or argv[1] not in ("type", "def", "refs"):
            die("query mode must be type|def|refs")
        mode = argv[1]
        line, col, root, path = parse_pos_args(argv[2:])
        name = token_at(path, line, col)
        if name is None:
            die("no symbol at %s:%d:%d" % (path, line, col))
        if mode == "type":
            # search the file first, then the repo (cross-file fns)
            for scope in ([path] + repo_files(root)):
                for s in file_symbols(scope):
                    if s["name"] == name:
                        if s["kind"] == "function":
                            sys.stdout.write("%s: %s\n" % (name, s["signature"]))
                        else:
                            sys.stdout.write("%s: %s\n" % (name, s["type"]))
                        return 0
            die("unknown symbol %r" % name)
        if mode == "def":
            d = find_def(root, name)
            if d is None:
                die("no definition for %r" % name)
            sys.stdout.write(json.dumps(d))
            return 0
        if mode == "refs":
            sys.stdout.write(json.dumps(find_refs(root, name)))
            return 0

    if argv[0] == "doc":
        args = [a for a in argv[1:] if a != "--format=json"]
        if "--format=json" not in argv[1:]:
            die("doc requires --format=json")
        if args:
            mod = args[0]
            entry = DOC["modules"].get(mod)
            if entry is None:
                die("unknown module %r" % mod)
            sys.stdout.write(json.dumps({"modules": {mod: entry}}))
        else:
            sys.stdout.write(json.dumps(DOC))
        return 0

    if argv[0] == "--emit=ast" or argv[0] == "dump-symbols":
        args = [a for a in argv[1:] if a != "--format=json"]
        if len(args) != 1:
            die("expected exactly one FILE")
        sys.stdout.write(json.dumps({"file": os.path.abspath(args[0]),
                                     "symbols": file_symbols(args[0])}))
        return 0

    die("unknown command %r (see ybc --help)" % argv[0])


if __name__ == "__main__":
    # pipes on Windows default to the locale encoding; ybc documents utf-8 output
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
