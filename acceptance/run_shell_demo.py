"""run_shell_demo — the APP-SHELL round's acceptance runner: ONE command.

    python acceptance/run_shell_demo.py

Exercises the IDE shell's flows API-LEVEL — the SAME hub endpoints the UI
calls (fsSource.ts / App.tsx runAnalyze), against a hub with the outer-wall
analysis attached, on EPHEMERAL ports, over a TEMP COPY of the moatpkg
fixture (the committed fixture is NEVER written — sha-verified at teardown).

The contract loop (APP-SHELL-CONTRACT.md §Acceptance):

  open folder      → GET /workspace facts == the declaration
  explorer         → GET /fs/list tree contains core.py (moatpkg/ dir walk)
  open core.py     → GET /fs/file content+sha256 == disk bytes
  edit + save      → PUT /fs/file (main now CALLS helpers.unused_fn)
  re-analyze       → POST /analyze (the UI's exact body: root = workspace
                     root, roots = the CURRENT declaredRoots — never lost,
                     never inferred — extractorConfig{pyright_mode,
                     python_package}, the hub's own vocabulary)
  graph updates    → GET /analysis: unused SHRUNK — unused_fn now reachable,
                     side_calc STILL unused
  revert + save    → PUT the original bytes back
  re-analyze       → GET /analysis: the ORIGINAL unused id set returns
                     (byte-same ids — determinism across re-runs)
  jail             → PUT /fs/file with a traversal path refused 403 with the
                     NAMED class `path-escape`, probed hub.fs.rejected
  root picker feed → GET /fs/roots-candidates ids == the served /graph's
                     non-module decl id set

Every check prints [PASS]/[FAIL] by name; ANY FAIL exits nonzero.  Teardown
is unconditional: hub.stop() + temp-dir removal, no orphan processes (the
pyright trees are owned by analyze_session's finally — cell-2 lifecycle).

pyright_mode is LIVE for every run here: with "none" the cross-module call
main→helpers.unused_fn would stay a LEAD and the unused set could not
honestly shrink — the whole loop depends on measured resolution.

SUB200 restructure (wave 2): this file is the ONE-COMMAND FACADE — same
CLI, same output format; the contract-loop check families live in
acceptance/shellchecks/*.py (carved verbatim).
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import time
from pathlib import Path

# shellchecks.common performs the runner's original bootstrap on import
# (UTF-8 console, sys.path → proofgraph root, outerwall + hub imports).
from shellchecks.common import (CHECKS, DECLARED_ROOT_NAME, FIXTURE, PACKAGE,
                                PYRIGHT_MODE, check, hub_server, sha256_bytes)
from shellchecks.flow_fs import run_fs_flows
from shellchecks.flow_analyze import run_analyze_flows
from shellchecks.flow_guards import run_guard_flows


def main() -> int:
    t0 = time.time()
    fixture_shas_before = {
        p.name: sha256_bytes(p.read_bytes()) for p in FIXTURE.iterdir()}

    print("== run_shell_demo: temp COPY of moatpkg + outer-wall hub on "
          "EPHEMERAL ports ==", flush=True)
    tmp = Path(tempfile.mkdtemp(prefix="shell-demo-"))
    hub = None
    try:
        shutil.copytree(FIXTURE, tmp / "moatpkg")

        # stand the hub the way serve_app does (factored attach pattern):
        # analysis attached on the SAME pipeline; workspace root = the temp
        # PARENT of the package dir (the span-vocabulary layout: moatpkg/…).
        session = hub_server.run_outerwall_session(
            tmp, roots=[DECLARED_ROOT_NAME],
            extractor_config={"python_package": PACKAGE,
                              "pyright_mode": PYRIGHT_MODE})
        log = session["hubLog"]
        hub = hub_server.HubServer(session["pipeline"], log=log)
        hub.attach_analysis(session["analysis"],
                            note="run_shell_demo: outer-wall analysis on the "
                                 "SAME pipeline (serve_app pattern)")
        hub.set_workspace(tmp, package=PACKAGE, pyright_mode=PYRIGHT_MODE,
                          declared_roots=session["declaredRoots"],
                          note="run_shell_demo startup")
        hub.start()   # ephemeral ports — the live demo stack is never touched
        port = hub.http_port
        print(f"   hub up on ephemeral http:{port} ws:{hub.ws_port} "
              f"(workspace jail {tmp})", flush=True)

        ws, core_disk, original_text = run_fs_flows(port, tmp, session)
        run_analyze_flows(port, tmp, ws, core_disk, original_text)
        run_guard_flows(port, tmp, log)

    finally:
        if hub is not None:
            try:
                hub.stop()
            except Exception:  # noqa: BLE001 — teardown stays unconditional
                pass
        shutil.rmtree(tmp, ignore_errors=True)

    # ---- the committed fixture was NEVER written ---------------------------
    fixture_shas_after = {
        p.name: sha256_bytes(p.read_bytes()) for p in FIXTURE.iterdir()}
    check("fixture-untouched", fixture_shas_before == fixture_shas_after,
          "committed acceptance/fixtures/moatpkg byte-identical before/after "
          "(every edit hit the TEMP copy only)")

    n_fail = sum(1 for c in CHECKS if not c["pass"])
    n_pass = len(CHECKS) - n_fail
    print(f"== run_shell_demo DONE in {time.time() - t0:.0f}s: "
          f"{n_pass} PASS, {n_fail} FAIL ==", flush=True)
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
