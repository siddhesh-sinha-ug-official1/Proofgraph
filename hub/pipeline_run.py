"""hub/pipeline_run.py — wall loading, root resolution, and THE pipeline.

SUB200 restructure: split out of hub/pipeline.py (which remains the facade
and re-exports every name here).  Behavior unchanged: extract through the
structure-extractor WALL, ingest through the graph-model WALL — walls only,
never cell cytoplasm.
"""
from __future__ import annotations

import re

# hub is import-flat by design (no __init__.py) — flat imports only.
from pipeline_log import DEFAULT_LOG, PACKAGES, HubError, HubLog
from pipeline_paths import (_load_module, assert_schema_pin,
                            ensure_paths, vessels_pathing)

_NODE_ID_RE = re.compile(r"^n_[0-9a-f]{16}\Z")


# ---------------------------------------------------------------------------
# Wall loading (walls only — never cell cytoplasm)
# ---------------------------------------------------------------------------

_walls: dict[str, object] = {}


def load_wall_modules(log: HubLog | None = None) -> dict:
    """The two Python wall modules the pipeline connects.  Primary: V3's
    pathing.load_wall (unique `proofgraph_wall_<cell>` aliases, shared with
    the vessels — never a bare `import wall`, which would bind whichever
    cell root comes first on sys.path).  Fallback mirrors the same aliases."""
    if not _walls:
        ensure_paths(log)
        pathing = vessels_pathing()
        if pathing is not None:
            _walls["extractor"] = pathing.load_wall("structure-extractor")
            _walls["graph_model"] = pathing.load_wall("graph-model")
        else:
            _walls["extractor"] = _load_module(
                "proofgraph_wall_structure_extractor",
                PACKAGES / "structure-extractor" / "wall.py")
            _walls["graph_model"] = _load_module(
                "proofgraph_wall_graph_model",
                PACKAGES / "graph-model" / "wall.py")
    return dict(_walls)


# ---------------------------------------------------------------------------
# Root resolution (declared, never inferred)
# ---------------------------------------------------------------------------

def resolve_roots(envelope: dict, roots, log: HubLog) -> list[str]:
    """Map caller-declared roots to node ids.  Accepted forms:
      * a canonical node id (n_<16hex>) present in the envelope — passthrough;
      * a node NAME matching exactly one non-module node — resolved to its id.
    Anything else is a typed unknown-root refusal — the hub never guesses.
    (The graph-model wall re-verifies: roots must be decl nodes.)"""
    if not roots:
        return []
    by_id = {n["id"] for n in envelope["nodes"]}
    resolved, decisions = [], []
    for r in roots:
        r = str(r)
        if _NODE_ID_RE.match(r):
            if r not in by_id:
                decisions.append({"root": r, "outcome": "unknown-id"})
                log.emit("hub.pipeline.roots", {"decisions": decisions, "ok": False})
                raise HubError("unknown-root",
                               f"declared root id {r!r} is not in the extracted envelope")
            resolved.append(r)
            decisions.append({"root": r, "outcome": "id-passthrough"})
            continue
        matches = [n["id"] for n in envelope["nodes"]
                   if n.get("name") == r and n.get("kind") != "module"]
        if len(matches) != 1:
            decisions.append({"root": r, "outcome": "unresolvable",
                              "matches": matches})
            log.emit("hub.pipeline.roots", {"decisions": decisions, "ok": False})
            raise HubError("unknown-root",
                           f"declared root {r!r} resolves to {len(matches)} "
                           f"non-module nodes (need exactly 1) — the hub never guesses")
        resolved.append(matches[0])
        decisions.append({"root": r, "outcome": "name-resolved", "id": matches[0]})
    log.emit("hub.pipeline.roots", {"decisions": decisions, "ok": True})
    return resolved


# ---------------------------------------------------------------------------
# THE pipeline: extract -> ingest (wall to wall)
# ---------------------------------------------------------------------------

def run_pipeline(source_root, roots=None, capability_fn=None,
                 extractor_config=None, out_dir=None, log: HubLog | None = None) -> dict:
    """extract(source_root) through the structure-extractor WALL, then
    ingest(nodes, edges, leads, roots) through the graph-model WALL.

    * `capability_fn` — the V1 socket, passed through verbatim.  None means
      the extractor's own stub (python->CT, everything else->G).  When V1's
      real adapter exists it plugs in HERE; the hub itself never mints a tier.
    * `roots` — declared MODEL roots (node ids or unique decl-node names);
      see resolve_roots.  None -> no roots declared -> reachable/unused
      queries refuse honestly downstream (roots-undeclared), never inferred.
    * `extractor_config` — PipelineConfig kwargs for the extractor wall
      (e.g. {"roots": [...], "python_package": "pkg", "pyright_mode": "none"});
      the extractor-side `roots` are ITS internal T3 diagnostic vocabulary
      (canonical names), distinct from the model-side declared roots above.

    Returns {"extractorWall", "modelWall", "envelope", "declaredRoots", "log"}.
    """
    log = log or DEFAULT_LOG
    assert_schema_pin(log)
    walls = load_wall_modules(log)
    log.emit("hub.pipeline.run", {
        "sourceRoot": str(source_root), "roots": list(roots) if roots else [],
        "capabilityFnInjected": capability_fn is not None,
        "extractorConfig": dict(extractor_config) if extractor_config else None})
    try:
        extractor_wall = walls["extractor"].extract_wall(
            dict(extractor_config) if extractor_config else None)
        envelope = extractor_wall.extract(
            source_root, capability_fn=capability_fn, out_dir=out_dir)
        model_wall = walls["graph_model"].create_wall()
        declared = resolve_roots(envelope, roots, log)
        model_wall.ingest(envelope["nodes"], envelope["edges"],
                          envelope["leads"], roots=declared)
    except HubError as exc:
        log.emit("hub.pipeline.rejected",
                 {"failureClass": exc.failure_class, "detail": str(exc)})
        raise
    except Exception as exc:  # wall refusals propagate UNWRAPPED, but logged
        log.emit("hub.pipeline.rejected", {
            "failureClass": getattr(exc, "failure_class",
                                    getattr(exc, "failureClass",
                                            type(exc).__name__)),
            "detail": str(exc)})
        raise
    log.emit("hub.pipeline.return", {
        "nodes": len(envelope["nodes"]), "edges": len(envelope["edges"]),
        "leads": len(envelope["leads"]), "declaredRoots": declared,
        "docks": sorted(envelope.get("honestCeilings", {}))})
    return {"extractorWall": extractor_wall, "modelWall": model_wall,
            "envelope": envelope, "declaredRoots": declared, "log": log}
