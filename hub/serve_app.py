"""serve_app — the HUMAN-FACE hub launcher (Phase 3, assembly code, additive).

Stands the backend hub on FIXED dev ports for the browsable app
(app/README.md: hub HTTP 8477 -> ai 8478 -> vite 5199; the hub's WS listener
is a separate socket — stdlib http.server cannot upgrade — and the app
discovers it via /health.lsp.url, so its port number is free to differ).

    python hub/serve_app.py                      # moatpkg fixture, pyright off, echo LSP
    python hub/serve_app.py --pyright live       # resolve calls with live pyright (slower start)
    python hub/serve_app.py --lsp live           # run cell 2's REAL battery and bridge
                                                 # pyright to the editor over /lsp (slow start:
                                                 # the battery measures, never asserts)
    python hub/serve_app.py --http-port N --ws-port M --fixture PATH --root NAME
    python hub/serve_app.py --analysis none            # pre-outerwall behavior: /analysis
                                                       # answers the typed 503 and the app
                                                       # shows the PENDING banner (default is
                                                       # attach: outer-wall rings live)

Honesty notes (all logged, never silent):
  * default --pyright none: cross-module calls stay LEADS (resolved=false) —
    the graph is honest about what was not resolved; /query?kind=unused then
    reports every non-module decl outside the root's resolved reach.
  * default --lsp none: the /lsp socket keeps the hub's EchoLspBackend; the
    app detects the absent capability stream via /pins/catalog
    (capability-layer available:false) and mounts its editor on the cell's
    own stub transport at tier "G" — no live diagnostics are claimed.
  * --lsp live re-uses V2's exact wiring: capability_wall('python') (measured
    battery), the V1 silent-tier-upgrade face-vs-pin guard, then
    CapabilityLspBackend on the hub socket + the T2 pins quartet aggregated.

Ctrl+C (or closing the console) stops the server; the capability wall is shut
down first so no pyright tree is orphaned.
"""
from __future__ import annotations

import argparse
import json
import signal
import sys
import threading
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
ROOT = HUB_DIR.parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import pipeline as hub_pipeline  # noqa: E402
import server as hub_server      # noqa: E402

DEFAULT_FIXTURE = ROOT / "acceptance" / "fixtures" / "moatpkg"
# The hub's resolve_roots wants a DECL node (exactly one non-module match);
# the moat case's entry decl is moatpkg.core.main (module roots are refused —
# "the hub never guesses").
DEFAULT_ROOT = "moatpkg.core.main"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--http-port", type=int, default=8477)
    ap.add_argument("--ws-port", type=int, default=8479)
    ap.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    ap.add_argument("--root", action="append", default=None,
                    # doc fix (claim audit): the default is the DECL node
                    # moatpkg.core.main — module roots are refused (see
                    # DEFAULT_ROOT above); the old help said "module"/"moatpkg.core"
                    help="declared root decl (repeatable); default moatpkg.core.main")
    ap.add_argument("--package", default=None,
                    help="python package name; default = fixture dir name")
    ap.add_argument("--pyright", choices=["none", "live"], default="none")
    ap.add_argument("--lsp", choices=["none", "live"], default="none")
    ap.add_argument("--analysis", choices=["attach", "none"], default="attach",
                    help="attach (default): run the outer wall's analyze_session() and "
                         "serve its result on GET /analysis — computed on the SAME "
                         "pipeline/wall the hub serves (Test07's proven pattern), so "
                         "the app's analysis-graph-mismatch guard holds and OUTLINE "
                         "rings render live. none: the app shows the honest "
                         "no-analysis-computed PENDING banner (pre-outerwall behavior).")
    args = ap.parse_args()

    roots = args.root or [DEFAULT_ROOT]
    package = args.package or args.fixture.name

    if args.analysis == "attach":
        # Outer-wall path: analyze_session runs the pipeline itself (REAL V1
        # capability feed, measured tiers only) and re-ingests the FILLED graph
        # through the model wall — HubServer on session["pipeline"] therefore
        # serves the outline-filled envelope on /graph and the byte-canonical
        # analysis on /analysis, one wall, no foreign-snapshot mismatch.
        # App-shell round: the pattern is FACTORED into
        # hub_server.run_outerwall_session so POST /analyze shares it (its
        # re-runs recompute + re-attach the analysis the same way); this CLI's
        # behavior is unchanged.
        session = hub_server.run_outerwall_session(
            args.fixture, roots=list(roots),
            extractor_config={"python_package": package,
                              "pyright_mode": args.pyright})
        result = session["pipeline"]
        log = session["hubLog"]
        hub = hub_server.HubServer(result, log=log)
        hub.attach_analysis(
            session["analysis"],
            note="serve_app: outer-wall analysis attached on the SAME pipeline/wall")
        declared_roots = session["declaredRoots"]
    else:
        log = hub_pipeline.HubLog()
        result = hub_pipeline.run_pipeline(
            args.fixture,
            roots=list(roots),
            extractor_config={"roots": list(roots), "python_package": package,
                              "pyright_mode": args.pyright},
            log=log)
        hub = hub_server.HubServer(result, log=log)
        declared_roots = result["declaredRoots"]

    # App-shell round: declare THE workspace (the /fs jail + /workspace facts).
    # Declared, never inferred — this is the explicit declaration.
    # Pre-GitHub round R1 fix: MIRROR POST /analyze's rule
    # (hub/server_analyze.analyze()) so the workspace root == the extraction
    # root used by the pipeline the hub is serving.  Extraction rule
    # (outerwall/analyze_roots._normalize_root):
    #   * single-FILE source  -> staged into a scratch dir; jail is that dir.
    #   * package-DIR source (has __init__.py) -> extracted DIRECTLY (the
    #     former copy-staging is retired); jail is the dir itself.  Span
    #     vocabulary is INGEST-root-relative, so a bare-dir extract mints
    #     'core.py' (NOT '<pkg>/core.py') — declaring the fixture's PARENT
    #     here (the old span-vocabulary comment described that retired
    #     copy-staging layout) misaligned /fs paths from served spans and
    #     dropped the app's re-analyze into unknown-root territory.
    #   * plain directory -> its own root, unchanged.
    fixture_path = Path(args.fixture)
    ws_root = fixture_path.parent if fixture_path.is_file() else fixture_path
    hub.set_workspace(ws_root, package=package, pyright_mode=args.pyright,
                      declared_roots=declared_roots,
                      note="serve_app startup"
                           + (" (single-file fixture — workspace root is the "
                              "parent dir; span vocabulary is the file name)"
                              if ws_root != fixture_path else ""))

    wall = None
    if args.lsp == "live":
        # V2's exact wiring (vessels/v2_hub_runner.py), reused not reinvented.
        sys.path.insert(0, str(ROOT / "vessels"))
        import pathing            # noqa: E402 — the sanctioned loader
        import lsp_backend        # noqa: E402
        capw = pathing.load_wall("capability-layer")
        wall = capw.capability_wall("python")
        if isinstance(wall, capw.WallRefusalNotice):
            print(json.dumps({"ready": False, "error": "unknown-language",
                              "detail": repr(wall)}), flush=True)
            return 2
        tier_pins = [e for e in wall.pins.history()
                     if e.get("probeId") == "capability.probe.measuredTier"]
        pin_tier = tier_pins[-1]["payload"]["measuredTier"] if tier_pins else None
        if pin_tier != wall.tier:   # V1's silent-tier-upgrade guard
            print(json.dumps({"ready": False, "error": "silent-tier-upgrade",
                              "faceTier": wall.tier, "pinTier": pin_tier}),
                  flush=True)
            wall.shutdown()
            return 2
        hub.attach_lsp_backend(lsp_backend.CapabilityLspBackend(wall, log=log))
        hub.attach_capability_pins(
            wall.pins, note="serve_app: T2 quartet aggregated for the app run")

    hub.start(http_port=args.http_port, ws_port=args.ws_port)
    env = result["envelope"]
    print(json.dumps({
        "ready": True,
        "httpPort": hub.http_port, "wsPort": hub.ws_port,
        "lspUrl": f"ws://{hub.host}:{hub.ws_port}/lsp",
        "fixture": str(args.fixture), "declaredRoots": declared_roots,
        "nodes": len(env["nodes"]), "edges": len(env["edges"]),
        "leads": len(env["leads"]),
        "pyright": args.pyright, "lsp": args.lsp, "analysis": args.analysis,
        **({"measuredTier": wall.tier} if wall is not None else {}),
    }), flush=True)

    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
    except (ValueError, OSError):
        pass
    try:
        stop.wait()
    finally:
        if wall is not None:
            wall.shutdown()
        hub.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
