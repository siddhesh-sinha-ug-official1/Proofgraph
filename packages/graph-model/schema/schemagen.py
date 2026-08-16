"""CLI: regenerate graph-schema.ts and schema.md from schema.json.

Usage:  python schema/schemagen.py   (from the graph-model/ directory)
"""
import json
import sys
from pathlib import Path

CELL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CELL_ROOT))

from src.schemagen_core import regenerate  # noqa: E402


def main():
    schema_dir = CELL_ROOT / "schema"
    schema_obj = json.loads((schema_dir / "schema.json").read_text(encoding="utf-8"))
    for filename, content in regenerate(schema_obj).items():
        (schema_dir / filename).write_bytes(content.encode("utf-8"))
        print(f"generated {filename} ({len(content)} chars) from schema.json")
    # graph-schema.ts is byte-MIRRORED from the canonical projection, not
    # generated here: the cell no longer carries a rival TS generator (its old
    # one silently missed the v0.1 amendment). See src/schemagen_core (cluster-U1).
    canonical_ts = CELL_ROOT.parent / "schema" / "gen" / "graph-schema.ts"
    ts_bytes = canonical_ts.read_bytes()
    (schema_dir / "graph-schema.ts").write_bytes(ts_bytes)
    print(f"mirrored graph-schema.ts ({len(ts_bytes)} bytes) from {canonical_ts}")


if __name__ == "__main__":
    main()
