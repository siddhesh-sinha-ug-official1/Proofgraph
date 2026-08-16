"""capability(lang, repo) -> Capability — the pipeline A→J (build prompt §5).

Stages A→I build and wire a candidate handle; stage J MEASURES it and stamps the
final tier. Code order is A,B,C,D,E,F,G,I,H,J — H (library inventory) needs the
wired handle, so it runs after I; probe events keep their per-stage labels.

Entry points (Probe Density Contract §3/§4):
  capability(lang, repo, config) — the one exported function
  probeCatalog()                 — every lead (re-exported from probes)
  dump()                         — the ENTIRE internal state at call time
  history()                      — ordered probe stream (logicalClock) of the last run
  tap(probeId, fn)               — subscribe to one live lead
"""

from __future__ import annotations

import os
import subprocess

from . import discovery as discovery_mod
from . import fixtures
from . import gate as gate_mod
from . import libinventory
from . import probe as probe_mod
from . import schema
from . import scip as scip_mod
from . import score as score_mod
from . import spine
from . import tree as tree_mod
from .floor import treesitter as ts
from .handle import Handle
from .probes import ProbeBus, probeCatalog, tap  # noqa: F401  (re-exported)
from .capability_config import (  # noqa: F401  (re-exported public surface)
    LEAN_TOOLCHAIN, _LAYER_ROOT, _default_config, _lake_exe, _plan_shim)
from .capability_state import (  # noqa: F401  (re-exported public surface)
    Capability, _LAST, dump, history)


def capability(lang: str, repo: str | None = None,
               config: dict | None = None) -> Capability:
    profile = fixtures.PROFILES[lang]
    cfg = _default_config(lang, config)
    os.makedirs(cfg["work_dir"], exist_ok=True)
    repo_map = {"yaddabinggiberish": "ybg_repo", "awk": "awk_repo",
                "zigish": "ybg_repo"}
    # [ASSEMBLY CHANGE V1] profile may declare its probe repo (additive key;
    # the three original languages keep the historical map).
    repo_dir = profile.get("probeRepo") or repo_map[lang]
    repo_root = repo or os.path.join(_LAYER_ROOT, "testbed", repo_dir)

    bus = ProbeBus()
    state: dict = {"cache": None}
    _LAST["bus"] = bus
    _LAST["state"] = state

    # A — discovery sweep  (dump() carries the ENTIRE state, help text included;
    # the discovery.output probe payload stays slim — the compilerHelp call lead
    # carries the full text)
    disc = discovery_mod.run(bus, profile, repo_root, cfg)
    state["discovery"] = dict(disc)
    # B — maintenance & license gate
    survivors = gate_mod.run(bus, disc, cfg)
    # C — paper-score (S1–S6)
    scorecard = score_mod.run(bus, profile, disc, survivors)
    state["scorecard"] = scorecard
    # D — decision-tree walk
    walk = tree_mod.run(bus, profile, disc, survivors)
    state["treewalk"] = walk
    # E — shim ladder
    plan = _plan_shim(bus, profile, disc, cfg)
    # F — tree-sitter floor (ALWAYS)
    floor_handle, floor_nanos = ts.build(bus, profile, repo_root)
    # G — SCIP index (if the compiler exposes a whole-build AST surface)
    scip_index = None
    if "--emit=ast --format=json" in disc["compilerModes"]:
        scip_index = scip_mod.run(bus, profile, repo_root, cfg)
    # I — wire + lifecycle
    # [ASSEMBLY CHANGE CAP-LEAN] optional workspace-prepare step (lean: `lake
    # build` so file workers can resolve imports).  Its outcome — success,
    # failure, or a broken argv — is a LEAD; a failed prepare never aborts the
    # run: the battery then MEASURES the degraded environment honestly.
    if cfg.get("prepare_argv"):
        try:
            cp = subprocess.run(cfg["prepare_argv"], capture_output=True,
                                text=True, encoding="utf-8", errors="replace",
                                timeout=cfg.get("prepare_timeout") or 600)
            prep_payload = {"argv": list(cfg["prepare_argv"]),
                            "exitCode": cp.returncode,
                            "stdoutTail": (cp.stdout or "")[-1500:],
                            "stderrTail": (cp.stderr or "")[-1500:]}
        except Exception as e:
            prep_payload = {"argv": list(cfg["prepare_argv"]),
                            "exitCode": None, "stdoutTail": "",
                            "stderrTail": repr(e)}
        bus.emit("capability.wire.prepare", "call", prep_payload, stage="wire")
    client = None
    if plan["argv"]:
        lock = os.path.join(repo_root, "ybg.lock")
        client = spine.wire(
            bus, file_ext=profile["fileExt"], server_name=plan["server_name"],
            argv=plan["argv"], env=plan["env"], root_path=repo_root,
            lock_path=lock if os.path.exists(lock) else None,
            client_encodings=cfg["client_encodings"],
            language_id=profile.get("languageId", "yaddabinggiberish"))
        state["shimState"] = {
            "advertised": client.capabilities,
            "positionEncoding": client.position_encoding,
            "docs": client.docs,
            "alive": client.alive,
            "serverInfo": client.server_info,
        }
    else:
        state["shimState"] = None
    # H — library inventory (needs the wired handle for on-demand)
    # From here on a wired server exists: any failure must not orphan it.
    try:
        state["libInventory"] = libinventory.run(bus, profile, disc, client, cfg)
        # J — the Capability Probe: the verdict
        battery = probe_mod.run(
            bus, client=client, floor_handle=floor_handle, repo_root=repo_root,
            profile=profile, config=cfg, paper_tier=scorecard["paperTier"],
            floor_nanos=floor_nanos)
    except BaseException:
        if client is not None:
            try:
                client.shutdown()
            except Exception:
                client.kill()
        raise
    state["battery"] = battery
    state["cache"] = dict(client._cache) if client else {}
    if client:
        state["shimState"]["alive"] = client.alive
        state["shimState"]["docs"] = dict(client.docs)

    tier = battery["measuredTier"]
    if client is not None and tier in ("CT", "S"):
        info = client.server_info or {}
        extractor = f"{info.get('name', plan['server_name'])}@" \
                    f"{info.get('version', '?')}"
        kind = "lsp"
    elif floor_handle is not None:
        extractor = floor_handle.extractor
        kind = "treesitter"
    else:
        extractor = f"plaintext-{lang}@0"
        kind = "plaintext"

    handle = Handle(tier=tier, kind=kind, extractor=extractor,
                    client=client if kind == "lsp" else None,
                    floor=floor_handle, scip=scip_index)
    cap = Capability(
        lang=lang, tier=tier, handle=handle,
        honestCeiling=schema.HONEST_CEILINGS[tier],
        paperTier=scorecard["paperTier"],
        provenance={"extractor": extractor,
                    "resolved": schema.DEPTH_ALLOWS_RESOLVED_EDGES[tier]},
        probeReport=battery,
        probeStream=list(bus.events))
    state["capability"] = {"lang": lang, "tier": tier, "paperTier":
                           scorecard["paperTier"], "extractor": extractor}
    # a server that was wired but did NOT earn lsp-kind is shut down here
    if client is not None and kind != "lsp":
        client.shutdown()
    return cap
