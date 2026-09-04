"""run_all_suites — the ONE clean-state command (remediation worklist item 4.2).

    python run_all_suites.py                  (from proofgraph/ or anywhere)

Runs EVERY suite of the assembly from a clean state and prints one per-suite
pass/fail table + grand totals; exits nonzero on any failure.

WHAT "CLEAN STATE" MEANS HERE (declared honestly, nothing smoothed):
  * every suite runs in a FRESH OS subprocess (new python interpreter / new
    node VM) — no in-process state, module caches, or monkeypatches survive
    between suites; suites run SEQUENTIALLY so none can lean on another's
    servers, ports, or load;
  * vitest suites run with --no-cache — no cached transform/test-result reuse;
  * editor-shell's `npm test` rebuilds its dist from source (tsc) before
    testing — no stale build is tested;
  * acceptance runs regenerate their analyses/evidence from live analyze()
    (run_demo writes analysis-*.json BEFORE its §7 gates — nothing replayed);
  * all servers under test bind EPHEMERAL ports (the suites' own convention);
    the live demo stack's fixed ports (8477/8478/8479/5199) are never
    squatted — the browser step is skipped here (--skip-browser) per
    worklist item 4.2, so no live vite is reused either;
  * the fault-injection suite (faultcheck/run_faults.py) builds its own
    scratch copies in tempdir and discards them.
  NOT reset, declared: python __pycache__ bytecode and npm node_modules
  (dependencies/compilation caches — they cannot cache a test RESULT), the
  elan/lake toolchains and the npx package cache (environment), and the
  suites' recorded fixtures (deliberate recordings whose freshness is gated
  by the suites' own recording-vs-live tests, e.g. cell 3's oracle gates).

Suite list = worklist item 4.2 verbatim — packages/schema (py+ts), the six
cell suites, hub, outerwall, ai, app (vitest incl. the P3 build gate + tsc),
vessels V1/V3, acceptance run_demo --skip-browser + run_shell_demo, and the
fault-injection suite — plus the wave-3 line-gate (linegate.py), which runs
FIRST.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PY = sys.executable

# Windows pipes default to the ANSI codepage — counts may carry UTF-8; never
# let the RUNNER crash on printing.
for _stream in (sys.stdout, sys.stderr):
    try: _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass                        # noqa: BLE001 — best effort

IS_WIN = os.name == "nt"

def _npm(*args: str) -> list[str]:
    """npm command, wrapped for Windows (cmd /c) where bare npm.cmd can't be
    exec'd directly by subprocess without shell=True."""
    if IS_WIN:
        return ["cmd", "/c", "npm", *args]
    return ["npm", *args]

def _npx(*args: str) -> list[str]:
    """npx command, same Windows wrapping as _npm."""
    if IS_WIN:
        return ["cmd", "/c", "npx", *args]
    return ["npx", *args]

SUITES: list[tuple[str, list[str], Path, int]] = [
    # name, command, cwd, timeout_s
    ("line-gate (sub-200 ceiling)", [PY, "linegate.py"], ROOT, 300),
    ("schema (py)", [PY, "tests/test_schema_package.py"],
     ROOT / "packages" / "schema", 600),
    ("schema (ts)", _npm("test"),
     ROOT / "packages" / "schema", 600),
    ("cell 1 graph-model", [PY, "-m", "unittest", "discover", "-s", "tests"],
     ROOT / "packages" / "graph-model", 900),
    ("cell 2 capability-layer", [PY, "-m", "pytest", "capability/tests", "-q"],
     ROOT / "packages" / "capability-layer", 2400),
    ("cell 3 structure-extractor", [PY, "selftest/run_all.py"],
     ROOT / "packages" / "structure-extractor", 2400),
    ("cell 4 editor-shell", _npm("test"),
     ROOT / "packages" / "editor-shell", 1800),
    ("cell 5 graph-view", _npx("vitest", "run", "--no-cache"),
     ROOT / "packages" / "graph-view", 1800),
    ("cell 6 byok-arena", _npm("test"),
     ROOT / "packages" / "byok-arena", 1800),
    ("hub", [PY, "hub/test_hub.py"], ROOT, 1800),
    ("outerwall", [PY, "outerwall/test_outerwall.py"], ROOT, 1800),
    ("ai", _npm("test"), ROOT / "ai", 900),
    ("app vitest (+build gate)", _npx("vitest", "run", "--no-cache"),
     ROOT / "app", 2400),
    ("app tsc --noEmit", _npx("tsc", "--noEmit"),
     ROOT / "app", 900),
    ("vessel V1 (capability x extractor)", [PY, "vessels/test_v1.py"], ROOT, 1800),
    ("vessel V3 (extractor x model)", [PY, "vessels/test_v3_extractor_to_model.py"],
     ROOT, 900),
    ("acceptance run_demo --skip-browser",
     [PY, "acceptance/run_demo.py", "--skip-browser"], ROOT, 2400),
    ("acceptance run_shell_demo", [PY, "acceptance/run_shell_demo.py"], ROOT, 1800),
    ("fault-injection (faultcheck)", [PY, "faultcheck/run_faults.py"], ROOT, 5400),
]


def _env() -> dict:
    env = dict(os.environ)
    env.update({"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
                "NO_COLOR": "1", "FORCE_COLOR": "0", "CI": "true"})
    return env


def _tree_kill(proc: subprocess.Popen) -> None:
    """Kill the WHOLE process tree — on Windows via taskkill /F /T, on
    POSIX via os.killpg (the subprocess is started in its own process
    group by _run_with_tree_kill).  Plain proc.kill() only reaps the
    direct child, orphaning node/vitest grandchildren that still hold the
    stdout pipe (failure class: `orphaned-subprocess-tree`)."""
    if proc is None or proc.poll() is not None: return
    if IS_WIN:
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, timeout=15)
        except Exception:                                # noqa: BLE001
            pass
    else:
        import signal
        try: os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except OSError: pass
        try: proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try: os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except OSError: pass
    try: proc.wait(timeout=10)
    except subprocess.TimeoutExpired: pass  # tree may still be exiting


def _run_with_tree_kill(cmd, cwd, env, timeout_s):
    """[H4] Popen wrapper so the timeout path can taskkill /T BEFORE the
    stdlib's own proc.kill()+communicate() blocks on grandchildren still
    holding the stdout pipe; after tree-kill pipe writers close, communicate
    sees EOF."""
    # On POSIX, start_new_session=True puts the child in its own process
    # group so _tree_kill can os.killpg the whole tree.  On Windows this
    # kwarg is ignored (taskkill /T handles tree-kill by PID).
    proc = subprocess.Popen(cmd, cwd=str(cwd), env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace",
                            start_new_session=(not IS_WIN))
    try:
        out, _ = proc.communicate(timeout=timeout_s)
        return proc.returncode, out or ""
    except subprocess.TimeoutExpired:
        _tree_kill(proc)
        try:
            out, _ = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            for s in (proc.stdout, proc.stderr, proc.stdin):
                try:
                    if s is not None: s.close()
                except OSError: pass
            out = ""
        return -1, (out or "") + \
            f"\n[run_all_suites] TIMEOUT after {timeout_s}s (tree-killed)"


COUNT_PATTERNS = [
    # faultcheck (FIRST: its output QUOTES other suites' summary lines)
    (re.compile(r"(faults caught: \d+/\d+[^\n]*)"), lambda m: m.group(1).strip()),
    # stdlib unittest
    (re.compile(r"Ran (\d+) tests?[\s\S]*?(OK|FAILED[^\n]*)"),
     lambda m: f"{m.group(1)} tests, {m.group(2).strip()}"),
    # pytest -q
    (re.compile(r"^(\d+ passed[^\n]*)$", re.M), lambda m: m.group(1).strip()),
    (re.compile(r"^(\d+ failed[^\n]*)$", re.M), lambda m: m.group(1).strip()),
    # vitest
    (re.compile(r"Tests\s+([^\n]+)"), lambda m: "Tests " + m.group(1).strip()),
    # node --test (TAP "# pass N" or spec-reporter "ℹ pass N")
    (re.compile(r"pass (\d+)[\s\S]*?fail (\d+)"),
     lambda m: f"pass {m.group(1)}, fail {m.group(2)}"),
    # acceptance runners
    (re.compile(r"(\d+ PASS[^\n]*)"), lambda m: m.group(1).strip()),
]


def counts_of(output: str) -> str:
    for pat, fmt in COUNT_PATTERNS:
        m = None
        for m in pat.finditer(output):
            pass                      # keep the LAST match (summaries trail)
        if m:
            return fmt(m)
    return ""


def main() -> int:
    log_dir = Path(tempfile.mkdtemp(prefix="pg-run-all-"))
    print("\n\n".join(__doc__.split("\n\n")[2:4]))  # clean-state declared out loud
    print(f"suite logs: {log_dir}")
    print(f"tree: {ROOT}\n")
    header = f"{'suite':<38} {'result':<7} {'time':>8}   counts"
    print(header)
    print("-" * len(header))
    rows, t0, all_ok = [], time.monotonic(), True
    for name, cmd, cwd, timeout_s in SUITES:
        t = time.monotonic()
        rc, out = _run_with_tree_kill(cmd, cwd, _env(), timeout_s)
        dt = time.monotonic() - t
        slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
        (log_dir / f"{slug}.log").write_text(out, encoding="utf-8")
        ok = rc == 0
        all_ok = all_ok and ok
        cts = counts_of(out) or ("clean (no output)" if ok and not out.strip()
                                 else "")
        row = (name, "PASS" if ok else "FAIL", dt, cts)
        rows.append(row)
        print(f"{name:<38} {row[1]:<7} {dt:>7.1f}s   {cts}", flush=True)
    print("-" * len(header))
    npass = sum(1 for r in rows if r[1] == "PASS")
    print(f"{'GRAND TOTAL':<38} {'PASS' if all_ok else 'FAIL':<7} "
          f"{time.monotonic() - t0:>7.1f}s   {npass}/{len(rows)} suites passed")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
