"""Deterministic fixture data for the discovery sweep + language profiles.

PARALLEL-BUILD SEAM: in production the ten index sources below are queried over
the network; this round each query is answered from these fixtures so the sweep
is offline, reproducible, and probe-stream-deterministic. The SOURCE LIST itself
is the mandated one (build prompt §6 Stage A) — swapping fixtures for live
queries later changes no probe shape.

Fixture languages:
  yaddabinggiberish — the walking-skeleton CT language: no server anywhere,
                      partial grammar, no SCIP, compiler with a check mode.
  awk               — the grammar-floor contrast: a "server" that is literally
                      the tree-sitter tree, stale, no semantic layer.
  zigish            — the looks-deep-but-isn't shape (paperTier CT, P2 fails):
                      a community server whose README claims compiler reuse.
  python            — [ASSEMBLY CHANGE V1] the first REAL language: the
                      discovery DATA below is still fixture-answered (same seam
                      as the others), but the wired server is the real
                      pyright-langserver spawned via `cmd /c npx --yes -p
                      pyright pyright-langserver --stdio`, and the P0–P11
                      battery MEASURES it live.  Nothing here asserts a tier —
                      the battery does.
  lean              — [ASSEMBLY CHANGE CAP-LEAN] the second REAL language
                      (remediation round): the wired server is the toolchain's
                      own `lean --server` watchdog, spawned via the elan shim
                      `lake +leanprover/lean4:v4.32.0 --dir=<testbed/lean_repo>
                      serve` (toolchain PINNED in the argv — elan's default
                      'stable' drifts), and the P0–P11 battery MEASURES it
                      live.  Nothing here asserts a tier — the battery does.
"""

# SUB200 restructure: the fixture DATA lives in fixtures_profiles.py and
# fixtures_discovery.py; this facade re-exports the identical objects.
from .fixtures_profiles import INDEX_SOURCES, PROFILES  # noqa: F401
from .fixtures_discovery import (  # noqa: F401
    ARCHIVED_SERVERS, COPYLEFT_SUBPROCESS_ONLY, DISCOVERY, PERMISSIVE, VETO)
