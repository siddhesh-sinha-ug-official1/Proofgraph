"""Per-language run configuration for the capability() pipeline: the lean
toolchain PIN, the default config table (which server argv, which repo,
which prepare step), and the stage-E shim-ladder plan.  Split out SUB200
from capability.py (the facade re-exports this surface)."""

from __future__ import annotations

import json
import os
import shutil
import sys

from . import spine

_LAYER_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# [ASSEMBLY CHANGE CAP-LEAN] the toolchain PIN for the lean profile.  elan's
# default 'stable' DRIFTS (observed live: v4.32.0 at assembly time, v4.32.2
# nine days later) — the pin rides the elan shim argv (`lake +<toolchain> …`)
# so the measured tier can never silently change under a toolchain update.
# The fixture repo's lean-toolchain file carries the same pin.
LEAN_TOOLCHAIN = "leanprover/lean4:v4.32.0"


def _lake_exe() -> str:
    """[ASSEMBLY CHANGE CAP-LEAN; pre-GitHub DOC-2] lake is resolved from
    PATH first, then from the PROOFGRAPH_LAKE env var (a caller-supplied
    absolute path, honored as-is), and finally raises: a build-machine
    absolute-path fallback was removed at DOC-2 for portability. Callers on
    machines without lake on PATH must set PROOFGRAPH_LAKE."""
    on_path = shutil.which("lake")
    if on_path:
        return on_path
    from_env = os.environ.get("PROOFGRAPH_LAKE")
    if from_env:
        return from_env
    raise FileNotFoundError(
        "lake not found on PATH and PROOFGRAPH_LAKE unset — "
        "install elan (https://leanprover.github.io/) and re-run, "
        "or set PROOFGRAPH_LAKE to an absolute path")


def _default_config(lang: str, overrides: dict | None) -> dict:
    cfg = {
        "ybc_argv": [sys.executable, os.path.join(_LAYER_ROOT, "testbed",
                                                  "mock_ybc.py")],
        "now": "2026-07-19",
        "client_encodings": ["utf-8", "utf-16"],
        "work_dir": os.path.join(_LAYER_ROOT, ".testtmp", f"{lang}-default"),
        "max_refs": None,
        "server_argv": None,
        "server_env": None,
        "server_name": None,
        # [ASSEMBLY CHANGE CAP-LEAN] optional workspace-prepare step run once
        # before stage I wires the server (lead: capability.wire.prepare).
        "prepare_argv": None,
        "prepare_timeout": None,
    }
    if lang == "zigish":
        # the discovered community server; stand-in binary = the shim in
        # structure-only mode (the zls shape: advertises depth, runs its own analyzer)
        cfg["server_argv"] = spine.shim_argv()
        cfg["server_env"] = {"YBG_LSP_MODE": "structure-only"}
        cfg["server_name"] = "zg-analyzer (structure-only stand-in)"
    if lang == "python":
        # [ASSEMBLY CHANGE V1] the REAL discovered server, spawned exactly the
        # way the assembly mandates on this platform (out-of-process; nothing
        # linked).  work_dir defaults INTO the probe repo so the P6/inventory
        # in-memory scratch docs resolve `import lib` against the repo's own
        # lib.py (nothing is ever written there — python has no compiler shim).
        if os.name == "nt":
            cfg["server_argv"] = ["cmd", "/c", "npx", "--yes", "-p", "pyright",
                                  "pyright-langserver", "--stdio"]
        else:
            cfg["server_argv"] = ["npx", "--yes", "-p", "pyright",
                                  "pyright-langserver", "--stdio"]
        cfg["server_env"] = {}
        cfg["server_name"] = "pyright-langserver (npx, out-of-process)"
        cfg["work_dir"] = os.path.join(_LAYER_ROOT, "testbed", "python_repo")
    if lang == "lean":
        # [ASSEMBLY CHANGE CAP-LEAN] the REAL toolchain server, spawned
        # out-of-process through the elan shim with the toolchain PINNED in
        # the argv and the workspace given via --dir (cwd-independent —
        # measured live).  work_dir defaults INTO the probe repo so the
        # P6/inventory in-memory scratch docs resolve `import lib` against
        # the built workspace (nothing is ever written there).
        # prepare_argv: `lake build` compiles Util+lib to .olean first —
        # MEASURED FACT on this toolchain: lake serve does NOT auto-build
        # imports; an unbuilt workspace leaves main.lean's header failing
        # ("unknown module prefix 'Util'") and the battery would measure the
        # degraded environment honestly.  The prepare step is emitted as the
        # catalogued lead capability.wire.prepare, never silent; it is
        # incremental (a warm second run is a no-op).
        lean_repo = os.path.join(_LAYER_ROOT, "testbed", "lean_repo")
        lake = _lake_exe()
        cfg["server_argv"] = [lake, "+" + LEAN_TOOLCHAIN,
                              "--dir=" + lean_repo, "serve"]
        cfg["server_env"] = {}
        cfg["server_name"] = ("lean4-language-server (lake serve, "
                              "toolchain-pinned, out-of-process)")
        cfg["work_dir"] = lean_repo
        cfg["prepare_argv"] = [lake, "+" + LEAN_TOOLCHAIN,
                               "--dir=" + lean_repo, "build"]
        cfg["prepare_timeout"] = 600
    cfg.update(overrides or {})
    return cfg


def _plan_shim(bus, profile, disc, cfg):
    """Stage E — the shim-ladder decision (decision point 6)."""
    if cfg["server_argv"]:
        # a discovered server is wired directly; the DIY ladder is not needed
        return {"argv": cfg["server_argv"], "env": dict(cfg["server_env"] or {}),
                "server_name": cfg["server_name"] or "discovered-server"}
    if profile.get("compilerCLI"):
        if "check --format=json" in disc["compilerModes"]:
            env = {"YBG_LSP_YBC_CMD": json.dumps(cfg["ybc_argv"]),
                   "YBG_LSP_MODE": "compiler",
                   "YBG_LSP_TMPDIR": cfg["work_dir"]}
            return {"argv": spine.shim_argv(), "env": env,
                    "server_name": "ybg-lsp (shim over ybc check --format=json)"}
        bus.emit("capability.shim.fallback", "branch",
                 {"reason": f"{profile['compilerCLI']} exposes no analysis API "
                            f"(modes: {disc['compilerModes']}) — only execution",
                  "cappedAt": "G+scraped-runtime-errors"}, stage="shim")
        return {"argv": None, "env": None, "server_name": None}
    bus.emit("capability.shim.fallback", "branch",
             {"reason": f"no compiler CLI declared for {profile['lang']}",
              "cappedAt": "G"}, stage="shim")
    return {"argv": None, "env": None, "server_name": None}
