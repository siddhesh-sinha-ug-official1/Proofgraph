"""Codegen: schema.json + capability.json -> every derived artifact (gen/ + PIN).

schema.json is the ONE source of truth; everything under gen/ (the TypeScript
types, the Python constants, the id-mint port, the human spec, the pin consts)
plus the PIN file are PROJECTIONS of it.  All enums, the version/revision pair,
the id scheme, the outline worst-case order, the worst-token->status table and
the unresolved placeholder are pulled from the parsed JSON — never
hand-maintained in parallel (the fused-vs-split token drift happened exactly
because the worst order lived only in prose).

SUB200 restructure: this module is now the FACADE — the templates and
generators live in the schemagen_* sibling modules, re-exported here so the
public surface (and the CLI) is unchanged.

CLI:
    python schemagen.py --write   regenerate every artifact in place
    python schemagen.py --check   byte-diff against disk; exit 1 on drift
"""
import sys

try:
    from .schema_tools import schema_hash
    from .schemagen_common import (_fill, _py_str_tuple, _py_value,
                                   _schema_facts, _ts_str_array)
    from .schemagen_ts_graph import _GRAPH_SCHEMA_TS, generate_graph_schema_ts
    from .schemagen_ts_ids import _IDS_TS, generate_ids_ts
    from .schemagen_py_constants import (_SCHEMA_CONSTANTS_PY,
                                         generate_schema_constants_py)
    from .schemagen_capability import (_CAPABILITY_PY, _CAPABILITY_TS,
                                       generate_capability_constants_py,
                                       generate_capability_constants_ts)
    from .schemagen_pin import _PIN_TS, generate_pin, generate_pin_ts
    from .schemagen_md import _SCHEMA_MD, generate_md
    from .schemagen_cli import load_sources, main, regenerate
except ImportError:  # imported flat (packages/schema on sys.path) or run as CLI
    from schema_tools import schema_hash
    from schemagen_common import (_fill, _py_str_tuple, _py_value,
                                  _schema_facts, _ts_str_array)
    from schemagen_ts_graph import _GRAPH_SCHEMA_TS, generate_graph_schema_ts
    from schemagen_ts_ids import _IDS_TS, generate_ids_ts
    from schemagen_py_constants import (_SCHEMA_CONSTANTS_PY,
                                        generate_schema_constants_py)
    from schemagen_capability import (_CAPABILITY_PY, _CAPABILITY_TS,
                                      generate_capability_constants_py,
                                      generate_capability_constants_ts)
    from schemagen_pin import _PIN_TS, generate_pin, generate_pin_ts
    from schemagen_md import _SCHEMA_MD, generate_md
    from schemagen_cli import load_sources, main, regenerate

__all__ = [
    "schema_hash",
    "generate_graph_schema_ts",
    "generate_ids_ts",
    "generate_schema_constants_py",
    "generate_capability_constants_py",
    "generate_capability_constants_ts",
    "generate_pin_ts",
    "generate_pin",
    "generate_md",
    "regenerate",
    "load_sources",
    "main",
]

if __name__ == "__main__":
    sys.exit(main())
