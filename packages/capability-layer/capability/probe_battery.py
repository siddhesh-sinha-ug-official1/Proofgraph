"""Stage J battery base -- shared helpers + the _Battery core (target file
discovery, emit/_guarded plumbing, encoding accessor, the measured-tier
derivation).  The probe families themselves are mixins: probe_p0_p2.py /
probe_p3_p5.py / probe_p6_p11.py; probe.py (the facade) assembles them."""

from __future__ import annotations

import os
import re

from . import spine
from .schema import HonestCeilingViolation

STAGE = "probe"


def stamp_tier(measured: str, p2_verdict: str) -> str:
    """The enforcement point: the code path that would stamp CT without a P2 pass
    is unreachable — it raises instead of returning."""
    if measured == "CT" and p2_verdict != "pass":
        raise HonestCeilingViolation(
            "attempt to stamp tier CT without a P2 pass — green may never be faked")
    return measured


def lsp_char(line_text: str, cp_index: int, encoding: str) -> int:
    """Convert a Python code-point index into an LSP 'character' offset in the
    NEGOTIATED position encoding (utf-8 characters are byte offsets; utf-16
    characters are utf-16 code units). Code-point indexes are neither."""
    prefix = line_text[:cp_index]
    if encoding == "utf-16":
        return len(prefix.encode("utf-16-le")) // 2
    return len(prefix.encode("utf-8"))


def _find_pos(text: str, pattern: str, group: int = 1):
    """(line0, cp_index, matched_name, line_text) of the first match, or None."""
    for i, line in enumerate(text.split("\n")):
        m = re.search(pattern, line)
        if m:
            return i, m.start(group), m.group(group), line
    return None


class _BatteryBase:
    def __init__(self, bus, client, floor_handle, repo_root, profile, config,
                 paper_tier, floor_nanos):
        self.bus = bus
        self.client = client
        self.floor = floor_handle
        self.repo_root = repo_root
        self.profile = profile
        self.config = config
        self.paper_tier = paper_tier
        self.floor_nanos = floor_nanos
        self.results = []
        self.p2 = "fail"
        self.restart_fast = None
        self.baseline_diags = []   # P1's diagnostics on the CLEAN file
        ext = profile["fileExt"]
        preferred = os.path.join(repo_root, "main" + ext)
        self.main_path = preferred if os.path.exists(preferred) else None
        if self.main_path is None:
            for dirpath, dirnames, filenames in os.walk(repo_root):
                dirnames.sort()
                for fn in sorted(filenames):
                    if fn.endswith(ext):
                        self.main_path = os.path.join(dirpath, fn)
                        break
                if self.main_path:
                    break
        with open(self.main_path, "r", encoding="utf-8") as f:
            self.main_text = f.read()
        self.main_uri = spine.path_to_uri(self.main_path)
        gen = os.path.join(repo_root, "gen" + ext)
        self.gen_path = gen if os.path.exists(gen) else None

    # ------------------------------------------------------------------

    def emit(self, pid, ran, verdict, request, response, evidence, licenses,
             wall_nanos=None):
        result = {"id": pid.upper(), "ran": ran, "verdict": verdict,
                  "request": request, "response": response,
                  "evidence": evidence, "licenses": licenses}
        self.results.append(result)
        self.bus.emit(f"capability.probe.{pid}", "value", result, stage=STAGE,
                      wall_nanos=wall_nanos)
        return result

    def _guarded(self, pid, fn, licenses):
        try:
            fn()
        except Exception as e:  # a probe failure is evidence, never a crash of J
            self.emit(pid, True, "fail", None, None,
                      f"probe raised {e!r} — treated as fail", licenses)

    def _encoding(self):
        return (self.client.position_encoding or "utf-8") if self.client else "utf-8"

    # ------------------------------------------------------------------

    def measured_tier(self):
        if self.client is not None and self.p2 == "pass":
            return "CT"
        if self.client is not None and self.client.alive:
            # confirm the server actually models structure before granting S
            try:
                resp = self.client.request("textDocument/documentSymbol",
                                           {"textDocument": {"uri": self.main_uri}})
                if resp.get("result"):
                    return "S"
            except Exception:
                pass
            return "G" if self.floor else "P"
        return "G" if self.floor else "P"
