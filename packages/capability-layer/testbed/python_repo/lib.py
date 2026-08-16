"""Tiny in-repo library: the P6 / inventory completion target.

The battery's completion probe types `import lib` then `lib.` in a scratch
document anchored in this repo, so these members are what pyright surfaces.
"""

VERSION: str = "1.0.0"


def parse(source: str) -> int:
    return len(source)


def render(count: int) -> str:
    return "x" * count
