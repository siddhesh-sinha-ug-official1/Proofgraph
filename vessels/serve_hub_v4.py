"""V4 vessel — hub launcher, spawned by app/test's V4 suite (each split
test file spawns its own instance via app/test/helpers/v4hub.ts).

Stands the REAL backend hub (hub/pipeline.py + hub/server.py — assembly code,
walls only) on ephemeral ports against cell 3's richpkg fixture (the V3-proven
extract->ingest path: recorded pyright, stub capability — wiring the real
capability wall is V1's seam, not V4's), then:

  1. prints ONE json line to stdout:
       {"httpPort", "wsPort", "nodes", "edges", "leads", "declaredRoots",
        "entryName"}
  2. blocks on stdin — the parent test holds our stdin pipe open; when the
     parent closes it (clean teardown) or dies (the OS closes it), read()
     returns and we stop the server and exit.  NO ORPHANED PYTHON: the child's
     lifetime is bounded by the parent's pipe, not by a timeout.

Bounds (logged here + in REPORT-V4): pyright_mode="recorded" — no live LSP
subprocess is ever spawned by this launcher, so no orphaned-subprocess-tree
risk arises; the capability seam stays the extractor's own stub (V1 scope).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

VESSELS_DIR = Path(__file__).resolve().parent
PROOFGRAPH_ROOT = VESSELS_DIR.parent
HUB_DIR = PROOFGRAPH_ROOT / "hub"
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import pipeline as hub_pipeline  # noqa: E402
import server as hub_server      # noqa: E402

FIXTURES = PROOFGRAPH_ROOT / "packages" / "structure-extractor" / "fixtures"

# Byte-for-byte the V3 rich bundle config (vessels/v3_seam_shared.py).
RICH_ROOTS = ["richpkg.core", "richpkg.models", "richpkg.dyn", "richpkg.core.alpha"]
RICH_CFG = {"roots": list(RICH_ROOTS), "python_package": "richpkg",
            "pyright_mode": "recorded",
            "pyright_recording_path": FIXTURES / "pyright" / "richpkg.recorded.json"}
RICH_ENTRY = "richpkg.core.alpha"   # the fixture's entry decl — V4's trace seed


def main() -> int:
    log = hub_pipeline.HubLog()
    result = hub_pipeline.run_pipeline(
        FIXTURES / "pyrich",
        roots=[RICH_ENTRY],              # model-side declared root (name->id at the hub)
        extractor_config=RICH_CFG,
        log=log)
    server = hub_server.HubServer(result, log=log).start()
    env = result["envelope"]
    print(json.dumps({
        "httpPort": server.http_port, "wsPort": server.ws_port,
        "nodes": len(env["nodes"]), "edges": len(env["edges"]),
        "leads": len(env["leads"]),
        "declaredRoots": result["declaredRoots"],
        "entryName": RICH_ENTRY,
    }), flush=True)
    try:
        sys.stdin.read()                 # parked until the parent closes the pipe
    except Exception:                    # noqa: BLE001 — any pipe error means "go down"
        pass
    server.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
