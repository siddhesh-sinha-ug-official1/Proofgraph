"""Driver for schemagen: assemble every generated artifact, write or byte-check.

Moved verbatim from schemagen.py (SUB200 restructure); schemagen.py remains the
facade and the CLI entry point (`python schemagen.py --write|--check`).
"""
import argparse
import json
from pathlib import Path

try:
    from .schema_tools import schema_hash
    from .schemagen_capability import (generate_capability_constants_py,
                                       generate_capability_constants_ts)
    from .schemagen_md import generate_md
    from .schemagen_pin import generate_pin, generate_pin_ts
    from .schemagen_py_constants import generate_schema_constants_py
    from .schemagen_ts_graph import generate_graph_schema_ts
    from .schemagen_ts_ids import generate_ids_ts
except ImportError:  # imported flat (packages/schema on sys.path)
    from schema_tools import schema_hash
    from schemagen_capability import (generate_capability_constants_py,
                                      generate_capability_constants_ts)
    from schemagen_md import generate_md
    from schemagen_pin import generate_pin, generate_pin_ts
    from schemagen_py_constants import generate_schema_constants_py
    from schemagen_ts_graph import generate_graph_schema_ts
    from schemagen_ts_ids import generate_ids_ts


# ── driver ───────────────────────────────────────────────────────────────────

def regenerate(schema_obj, capability_obj):
    """Return {relative posix path: content} for every generated artifact."""
    return {
        "gen/graph-schema.ts": generate_graph_schema_ts(schema_obj),
        "gen/ids.ts": generate_ids_ts(schema_obj),
        "gen/schema_constants.py": generate_schema_constants_py(schema_obj),
        "gen/capability_constants.py": generate_capability_constants_py(capability_obj),
        "gen/capability_constants.ts": generate_capability_constants_ts(capability_obj),
        "gen/pin.ts": generate_pin_ts(schema_obj),
        "gen/schema.md": generate_md(schema_obj),
        "PIN": generate_pin(schema_obj),
    }


def load_sources(pkg_root=None):
    pkg_root = Path(pkg_root) if pkg_root else Path(__file__).resolve().parent
    schema_obj = json.loads((pkg_root / "schema.json").read_text(encoding="utf-8"))
    capability_obj = json.loads((pkg_root / "capability.json").read_text(encoding="utf-8"))
    return schema_obj, capability_obj


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Regenerate (or byte-check) every artifact derived from "
                    "schema.json + capability.json.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true",
                       help="regenerate every artifact in place")
    group.add_argument("--check", action="store_true",
                       help="byte-diff generated artifacts against disk; exit 1 on drift")
    args = parser.parse_args(argv)

    pkg_root = Path(__file__).resolve().parent
    schema_obj, capability_obj = load_sources(pkg_root)
    outputs = regenerate(schema_obj, capability_obj)

    if args.write:
        for relpath, content in outputs.items():
            target = pkg_root / relpath
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content.encode("utf-8"))
            print(f"wrote {relpath}")
        return 0

    drifted = []
    for relpath, content in outputs.items():
        target = pkg_root / relpath
        if not target.exists():
            drifted.append(f"{relpath}: missing")
        elif target.read_bytes() != content.encode("utf-8"):
            drifted.append(f"{relpath}: not byte-regenerable from schema.json")
    if drifted:
        for line in drifted:
            print(line)
        print("failure-class=codegen-drift: run `python schemagen.py --write`")
        return 1
    print(f"{len(outputs)} generated artifacts in sync "
          f"(schemaHash {schema_hash(schema_obj)[:12]}…)")
    return 0
