"""Named failure classes (Operating Contract rule 7: name the failure class
before the fix).  Every gate raises with an explicit failure-class string."""


class CellError(Exception):
    """Wrapper for any error caught at a stage boundary; already probed on the
    bus as graph-model.harness.error before being raised."""

    def __init__(self, stage, error_class, message):
        self.stage = stage
        self.error_class = error_class
        super().__init__(f"[stage={stage}] [class={error_class}] {message}")


class GateFailure(Exception):
    """A constitution-level gate failed. In the cell pipeline failure_class is
    one of: schema-drift, codegen-drift, id-collision, fake-green, unknown-root,
    t3-library-disagreement, condensation-not-dag, graphjson-nonconformant,
    projection-id-drift.  (The wall's WallRejection subclass carries the wall's
    own classes — see src/wall/base.py.)"""

    def __init__(self, failure_class, message):
        self.failure_class = failure_class
        super().__init__(f"failure-class={failure_class}: {message}")
