"""Stage A — Discovery sweep (runbook step 1, ~5 min box).

Queries the ten mandated index sources (fixture-answered this round — see
capability/fixtures.py for the seam), collects candidate servers, grammar and
SCIP availability, library-inventory sources, and — decisively — the compiler's
exposed analysis surface via `<compiler> --help` (a REAL subprocess call; the
runbook's grep one-liner `ybc --help | grep -iE 'lsp|check|ast|json|emit|query|doc'`
is implemented in-process as regexes over the help text — _MODE_PATTERNS).

Every consulted source and every finding is a lead.
"""

from __future__ import annotations

import re
import subprocess
import time

from . import fixtures

STAGE = "discovery"

# (mode name, regex over the help text) — ordered by usefulness (build prompt §7.6)
_MODE_PATTERNS = [
    ("lsp", r"^\s*ybc\s+lsp\b"),                       # the jackpot: built-in server
    ("check --format=json", r"\bcheck\s+--format=json\b"),
    ("check", r"^\s*ybc\s+check\b"),
    ("query type", r"\bquery\s+type\b"),
    ("query def", r"\bquery\s+def\b"),
    ("query refs", r"\bquery\s+refs\b"),
    ("doc --format=json", r"\bdoc\s+--format=json\b"),
    ("--emit=ast --format=json", r"--emit=ast\s+--format=json"),
    ("dump-symbols", r"\bdump-symbols\b"),
]


def discover_compiler_modes(ybc_argv, bus=None, stage=STAGE, cause=None):
    """Run `<compiler> --help` and parse the exposed analysis modes.

    Both the invocation and any spawn failure are leads (no silent drop): a
    broken ybc_argv must be distinguishable from a compiler that genuinely
    exposes no analysis surface."""
    argv = list(ybc_argv) + ["--help"]
    try:
        cp = subprocess.run(argv, capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=30)
        help_text = cp.stdout or ""
        if bus is not None:
            bus.emit("capability.discovery.compilerHelp", "call",
                     {"argv": argv, "stdout": help_text, "stderr": cp.stderr,
                      "exitCode": cp.returncode}, stage=stage, cause_id=cause)
    except Exception as e:
        if bus is not None:
            bus.emit("capability.discovery.compilerHelp", "call",
                     {"argv": argv, "stdout": "", "stderr": repr(e),
                      "exitCode": None}, stage=stage, cause_id=cause)
            bus.emit("capability.discovery.error", "error",
                     {"argv": argv, "error": repr(e)}, stage=stage,
                     cause_id=cause)
        return [], f"<--help failed: {e!r}>"
    modes = []
    for name, pat in _MODE_PATTERNS:
        if re.search(pat, help_text, re.MULTILINE):
            modes.append(name)
    return modes, help_text


def run(bus, profile: dict, repo_root: str, config: dict) -> dict:
    t0 = time.perf_counter_ns()
    cause = bus.emit("capability.discovery.input", "input", profile, stage=STAGE)

    lang = profile["lang"]
    fx = fixtures.DISCOVERY.get(lang, {"hits": {}, "grammar": {"exists": False,
                                 "partial": False, "source": None},
                                 "scip": {"indexer": None}, "libSources": [],
                                 "registryPackages": []})

    candidates = []
    for src in fixtures.INDEX_SOURCES:
        hits = fx["hits"].get(src["source"], [])
        bus.emit("capability.discovery.source.query", "call",
                 {"source": src["source"], "url": src["url"],
                  "query": lang,
                  "response": {"hits": [h["name"] for h in hits],
                               "raw": hits}},
                 stage=STAGE, cause_id=cause)
        for h in hits:
            if all(c["name"] != h["name"] for c in candidates):
                candidates.append(dict(h))
                bus.emit("capability.discovery.candidate", "node", dict(h),
                         stage=STAGE, cause_id=cause)

    bus.emit("capability.discovery.grammar", "value", fx["grammar"],
             stage=STAGE, cause_id=cause)
    bus.emit("capability.discovery.scip", "value", fx["scip"],
             stage=STAGE, cause_id=cause)

    compiler_modes: list[str] = []
    help_text = None
    if profile.get("compilerCLI"):
        compiler_modes, help_text = discover_compiler_modes(
            config["ybc_argv"], bus=bus, cause=cause)
        for mode in compiler_modes:
            bus.emit("capability.discovery.compilerMode", "value", mode,
                     stage=STAGE, cause_id=cause)

    for ls in fx["libSources"]:
        bus.emit("capability.discovery.libSource", "value", ls,
                 stage=STAGE, cause_id=cause)

    if not candidates:
        bus.emit("capability.discovery.none", "branch",
                 {"reason": "no server in any index — the DIY build path"},
                 stage=STAGE, cause_id=cause)

    result = {
        "candidates": candidates,
        "grammar": fx["grammar"],
        "scip": fx["scip"],
        "libSources": fx["libSources"],
        "registryPackages": fx["registryPackages"],
        "compilerModes": compiler_modes,
        "officialLsp": "lsp" in compiler_modes,
        "compilerHelp": help_text,
    }
    bus.emit("capability.discovery.output", "output",
             {k: v for k, v in result.items() if k != "compilerHelp"},
             stage=STAGE, cause_id=cause)
    bus.emit("capability.discovery.timing", "timing", {}, stage=STAGE,
             cause_id=cause, wall_nanos=time.perf_counter_ns() - t0)
    return result
