"""Helper module: used_fn is reachable from the root; unused_fn is the moat story."""


def used_fn(x: int) -> int:
    return x + 1


def unused_fn(x: int) -> int:
    """Never called from any root-reachable code path — the unused flag's target."""
    return x - 1
