"""Shared canonical-package loading for the membrane test files (SUB200
restructure: test_schema_sync.py split into test_schema_sync.py /
test_schema_rulings.py — total test count unchanged, no assertion touched)."""
import importlib.util
import json
import sys

from harness import TREE

SCHEMA_PKG = TREE.parent / "schema"


def _load_flat(module_name: str, rel_path: str):
    """Load a canonical-package module by file path (packages/schema/gen has no
    __init__.py; flat loading also avoids polluting sys.path for the suite)."""
    spec = importlib.util.spec_from_file_location(module_name, SCHEMA_PKG / rel_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ids.py first (no deps); schema_tools falls back to flat `import ids`, so it
# needs packages/schema on sys.path only during load.
sys.path.append(str(SCHEMA_PKG))
import ids as canonical_ids                    # noqa: E402,F401
import schema_tools as canonical_tools         # noqa: E402,F401
import pin as canonical_pin                    # noqa: E402,F401
sys.path.remove(str(SCHEMA_PKG))

schema_constants = _load_flat("canonical_schema_constants", "gen/schema_constants.py")
capability_constants = _load_flat("canonical_capability_constants", "gen/capability_constants.py")

VECTORS = json.loads((SCHEMA_PKG / "vectors.json").read_text(encoding="utf-8"))
