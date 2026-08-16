"""Shared context for the schema package gates (suite split by concern).

Puts packages/schema and packages/schema/gen on sys.path, loads the canonical
JSON documents once, and carries the shared verdict-case table.  Run the whole
suite from packages/schema:

    python -m unittest discover -s tests

The verdict cases below are duplicated VERBATIM in tests/context.ts — the two
suites asserting the same table on both implementations is the cross-language
agreement gate for the outline policy (vectors.json plays the same role for
the id mint)."""
import json
import sys
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[1]
for p in (str(PKG_ROOT), str(PKG_ROOT / "gen")):
    if p not in sys.path:
        sys.path.insert(0, p)

SCHEMA_OBJ = json.loads((PKG_ROOT / "schema.json").read_text(encoding="utf-8"))
CAPABILITY_OBJ = json.loads((PKG_ROOT / "capability.json").read_text(encoding="utf-8"))
VECTORS = json.loads((PKG_ROOT / "vectors.json").read_text(encoding="utf-8"))

# Shared verdict cases — keep byte-identical with tests/context.ts.
# (worstOf, expected worstToken, expected status, expected unrecognized)
VERDICT_CASES = [
    (["green"], "green", "green", []),
    (["lemma", "blue"], "blue", "blue", []),
    (["definition", "lemma"], "definition", "blue", []),
    (["red", "amber", "green"], "red", "red", []),
    (["none", "green"], "none", "green", []),
    (["amber", "blue"], "amber", "amber", []),
    ([], "none", "green", []),
    (["none/green"], "none/green", "unknown", ["none/green"]),
    (["green", "mystery-token"], "mystery-token", "unknown", ["mystery-token"]),
    (["red", "none/green"], "none/green", "unknown", ["none/green"]),
]
