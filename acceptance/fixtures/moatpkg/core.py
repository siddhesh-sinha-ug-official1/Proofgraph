"""Entry module of the acceptance moat case (declared root: moatpkg.core)."""

from moatpkg import helpers


def main() -> int:
    return helpers.used_fn(3)


def side_calc(x: int) -> int:
    return helpers.used_fn(x) * 2
