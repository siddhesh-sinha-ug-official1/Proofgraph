"""Probe-repo entry module — the representative file the P0-P11 battery opens.

Layout notes (the battery derives its targets by scanning this text):
  * the bare call statement `helper(...)` is the cross-file callee target
    (defined in util.py, imported here) for P4/P5/P7/P9;
  * `lib.parse(...)` is the dependency-callee target for P4;
  * there is deliberately no `let ... = ` line: P2 falls through to its
    generic injection `result = "str" + 1`, which IS a real python type error
    (pyright: operator "+" not supported for str and int).
"""
from util import helper

import lib


def main() -> int:
    helper(lib.parse("src"))
    return helper(3)
