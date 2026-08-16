"""proofgraph backend hub — HTTP + WS server (Phase 2 vasculature; assembly code).

HTTP (stdlib http.server, threading — zero new deps):
    GET  /health                canonical liveness + versions + schema pin
    GET  /graph                 the canonical envelope, canonical-json serialized
                                (bytes == canonical_json(modelWall.project('graph')));
                                guarded: serializer-edge-drop, envelope-version-mismatch
    GET  /graph/truth           V4's second leg: the SAME envelope rebuilt from the
                                model wall's PIN surface (pins.dump()['wall']
                                ['ingested']) and serialized DIRECTLY via the
                                canonical serializer — deliberately bypassing the
                                /graph serializer seam, so a cheap or tampered
                                /graph path is catchable client-side by three-way
                                id-set equality (serializer-edge-drop)
    GET  /query?kind=unused|reachable|unreferenced|sccs|condensation[&roots=a,b]
                                == modelWall.query(kind); wall refusals surface
                                as typed {failureClass} JSON, never faked results
    GET  /verdict/<nodeId>      == modelWall.verdictOf(nodeId)   (also /verdicts/<id>)
    GET  /analysis              Phase 3 additive: the outer wall's analyze()
                                result, canonical-json serialized — served
                                once attach_analysis(...) stored it; before
                                that, typed refusal no-analysis-computed
    GET  /pins/catalog          aggregated {hub:{...}, cells:{...}} probe catalogs
    GET  /pins/history[?limit=N]aggregated probe histories — the seed of the SYSTEM
                                diagnostic surface; per-stream tail bound LOGGED
                                (hub.pins.history.truncated), never silent
    POST /analyze {root, roots?, extractorConfig?}
                                re-runs the pipeline, serialized (pipeline-busy on
                                overlap; the capability wall's one-run-at-a-time
                                lock is respected BY this serialization).
                                App-shell round: the run goes through the OUTER
                                WALL's analyze_session (serve_app's attach
                                pattern, factored into run_outerwall_session so
                                both callers share it) — the outer-wall analysis
                                is recomputed on the SAME pipeline and re-attached
                                (hub.analyze.reattach), so /graph + /analysis stay
                                one wall after every re-run
    App-shell round additive (APP-SHELL-CONTRACT.md — the workspace-fs surface;
    the browser NEVER touches the filesystem, every file op goes through here,
    path-JAILED to the declared workspace root):
    GET  /workspace             {root, package, declaredRoots, analyzedAt,
                                pyrightMode} — workspace-not-open before any
                                set_workspace()/POST /analyze declared one
    GET  /fs/list?path=REL      dir listing {entries:[{name, kind:dir|file,
                                size}]} — jailed (path-escape probed)
    GET  /fs/file?path=REL      {path, encoding:utf8, content, sha256, byteLen}
                                — jailed; binary (non-utf-8) refused fs-io-error
                                (utf-8 files this round)
    PUT  /fs/file {path,content} save; jailed; returns the new sha256; probed
                                hub.fs.write {path, sha256, bytes}
    GET  /fs/roots-candidates   decl-kind nodes of the CURRENT envelope
                                {id, name, kind, file} — the root-picker's feed;
                                module nodes excluded (model-wall roots are DECL
                                ids — V3's root-vocabulary-mismatch lesson);
                                roots stay DECLARED, never inferred

WS (websockets, BSD-3 — the hub's ONE third-party dep, see README):
    /lsp                        a JSON-RPC frame bridge with a pluggable backend
                                socket `attach_lsp_backend(...)`.  One complete
                                JSON-RPC message per WS text frame (no
                                Content-Length envelope).  The bridge is
                                direction-agnostic and content-opaque: frames
                                pass byte-exactly BOTH ways, including
                                server->client requests (workspace/configuration
                                and friends) — V2 attaches the real capability
                                handle to this same socket next stage.  Shipped
                                backend: EchoLspBackend (loopback).

Query note: `unreferenced` is served as an alias resolved by the MODEL WALL's
own vocabulary — the hub forwards kind strings verbatim except for this one
documented alias (unreferenced -> unused), logged per request.

SUB200 restructure: this module is now the FACADE.  HubServer is composed
here from the split face modules — server_core (state + lifecycle),
server_fs (workspace jail), server_surfaces (truth/analysis/roots/pins),
server_analyze (run_outerwall_session + POST /analyze), server_ws (the WS
/lsp bridge) and server_http/server_http_get (the HTTP handler) — with
render_graph_payload kept HERE (the /graph serializer-seam leg).  Every
public name is re-exported; external importers are unchanged.
"""
from __future__ import annotations

import json

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline
from server_analyze import AnalyzeMixin, run_outerwall_session
from server_core import PINS_STREAM_LIMIT_DEFAULT, HubServerCore
from server_fs import WorkspaceFsMixin
from server_http import (_HTTP_STATUS_BY_CLASS, QUERY_KIND_ALIASES,
                         _failure_class_of, _make_handler)
from server_lsp import (LSP_RAW_RETENTION_BYTES, BridgeSession,
                        EchoLspBackend, _sha256)
from server_surfaces import SurfacesMixin
from server_ws import LspBridgeMixin

HubError = hub_pipeline.HubError
HubLog = hub_pipeline.HubLog
HUB_VERSION = hub_pipeline.HUB_VERSION
SCHEMA_PIN_VERSION = hub_pipeline.SCHEMA_PIN_VERSION
SCHEMA_PIN_HASH = hub_pipeline.SCHEMA_PIN_HASH


class HubServer(LspBridgeMixin, WorkspaceFsMixin, SurfacesMixin,
                AnalyzeMixin, HubServerCore):
    """One HTTP listener (stdlib) + one WS listener (websockets), both on
    ephemeral ports by default.  All state honest: the served graph is always
    re-projected from the graph-model WALL at request time and re-verified
    (id-set equality) after serialization — a cheap serializer that drops rows
    is caught, named, and refused (serializer-edge-drop)."""

    # ---- /graph rendering (guarded) -----------------------------------------
    def render_graph_payload(self) -> tuple[bytes, dict]:
        """Project the canonical envelope from the MODEL WALL, serialize it
        canonically, then re-parse the exact bytes and verify: (a) pinned
        schemaVersion, (b) node/edge/lead id sets EXACTLY equal the wall's.
        A cheap serializer that drops rows is refused by name.

        Wave D E4 (pre-GitHub): the verified (payload, counts) tuple is
        cached per (attached-pipeline identity, serializer identity).  On
        cache hit the pre-verified bytes are returned directly — the
        serializer-edge-drop / envelope-version-mismatch gates still ran
        the first time; a subsequent GET /graph on the SAME pipeline is a
        served-bytes replay.  The cache invalidates automatically when the
        pipeline object is swapped (POST /analyze reattach) — id(self.
        _pipeline) changes, so does the serializer test-seam id — so the
        gates re-fire whenever the underlying material could have moved.
        """
        pl = self._pipeline
        if pl is None:
            raise HubError("no-graph-ingested",
                           "no pipeline run has produced a graph yet")
        cache = getattr(self, "_graph_payload_cache", None)
        cache_key = (id(pl), id(self._graph_serializer))
        if cache is not None and cache[0] == cache_key:
            return cache[1], dict(cache[2])       # served-bytes replay
        envelope = pl["modelWall"].project("graph")
        if envelope.get("schemaVersion") != SCHEMA_PIN_VERSION:
            raise HubError("envelope-version-mismatch",
                           f"wall envelope schemaVersion "
                           f"{envelope.get('schemaVersion')!r} != pinned "
                           f"{SCHEMA_PIN_VERSION!r}")
        payload = self._graph_serializer(envelope)
        served = json.loads(payload.decode("utf-8"))
        if served.get("schemaVersion") != SCHEMA_PIN_VERSION:
            raise HubError("envelope-version-mismatch",
                           f"SERVED schemaVersion {served.get('schemaVersion')!r} "
                           f"!= pinned {SCHEMA_PIN_VERSION!r}")
        counts = {}
        for key in ("nodes", "edges", "leads"):
            want = [row["id"] for row in envelope[key]]
            got = [str(row.get("id")) for row in served.get(key, [])]
            if sorted(want) != sorted(got):
                raise HubError(
                    "serializer-edge-drop",
                    f"served {key} id set != wall {key} id set "
                    f"(wall {len(want)}, served {len(got)}; "
                    f"missing={sorted(set(want) - set(got))[:5]}, "
                    f"extra={sorted(set(got) - set(want))[:5]}) — the cheap "
                    f"serializer dropped or invented rows")
            counts[key] = len(want)
        self._graph_payload_cache = (cache_key, payload, dict(counts))
        return payload, counts


__all__ = [
    "HubServer", "run_outerwall_session", "EchoLspBackend", "BridgeSession",
    "QUERY_KIND_ALIASES", "LSP_RAW_RETENTION_BYTES",
    "PINS_STREAM_LIMIT_DEFAULT", "HubError", "HubLog", "HUB_VERSION",
    "SCHEMA_PIN_VERSION", "SCHEMA_PIN_HASH",
]
