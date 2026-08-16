"""Probe family P0-P2 (+ the injection helpers): capability map, aliveness,
and the compiler-truth litmus.  Mixin over probe_battery._BatteryBase."""

from __future__ import annotations

import os
import re

from .probe_battery import STAGE


class _ProbesP0toP2:
    # -- the probes ------------------------------------------------------

    def p0_capabilities(self):
        if self.client is None:
            self.emit("p0", False, "skip", None, None,
                      "no LSP server wired; floor-only target", "nothing to degrade-map")
            return
        caps = self.client.capabilities
        self.emit("p0", True, "pass" if caps else "fail",
                  {"method": "initialize (readback)"}, caps,
                  f"server advertised {sorted(caps.keys())}",
                  "the map of what's worth testing + the degrade plan")

    def p1_open_clean(self):
        if self.client is None:
            tree = self.floor.parse(self.main_text)
            errs = tree.count("ERROR")
            self.emit("p1", True, "pass" if errs == 0 else "warn",
                      {"parse": os.path.basename(self.main_path)},
                      {"errorNodes": errs},
                      "grammar floor parsed the representative file",
                      "the floor is alive and parsing")
            return
        self.client.did_open(self.main_uri, self.main_text)
        # [ASSEMBLY CHANGE CAP-LEAN] profiles that declare settleDiagnostics
        # (lean) publish progressively — wait for the SETTLED set, not the
        # first publish (which lean measurably sends as [] mid-elaboration).
        # Fixture languages keep the historical single-publish path.
        if self.profile.get("settleDiagnostics"):
            note = self.client.wait_diagnostics_settled(self.main_uri)
        else:
            note = self.client.wait_notification(
                "textDocument/publishDiagnostics",
                pred=lambda m: m["params"]["uri"] == self.main_uri)
        diags = note["params"]["diagnostics"]
        self.baseline_diags = diags
        self.emit("p1", True, "pass" if diags == [] else "warn",
                  {"method": "textDocument/didOpen",
                   "file": os.path.basename(self.main_path)},
                  diags,
                  "clean file produced %d diagnostic(s)" % len(diags),
                  "the server is alive and analyzing")

    def _inject_error(self):
        """Replace a well-typed let with a wrong-typed literal (generic)."""
        lines = self.main_text.split("\n")
        # [ASSEMBLY CHANGE CAP-LEAN] a profile may declare its own appended
        # injection (p2Injection) when the generic forms cannot produce a
        # TYPE error in that language: for lean, `result = "str" + 1` is a
        # PARSE error (grammar-level — the wrong kind of evidence for the
        # compiler-truth litmus), while `example : Nat := "s"` elaborates and
        # fails in the type checker.  Same append-at-end shape as the generic
        # fallback; fixture languages are unchanged (key absent).
        inj = self.profile.get("p2Injection")
        if inj:
            return self.main_text + "\n" + inj + "\n", len(lines)
        for i, line in enumerate(lines):
            m = re.match(r"(\s*let\s+\w+\s*:\s*)(\w+)(\s*=\s*)(.+)", line)
            if m:
                wrong = '"nope"' if m.group(2) != "String" else "42"
                lines[i] = m.group(1) + m.group(2) + m.group(3) + wrong
                return "\n".join(lines), i
        # no typed let (e.g. awk): append semantic nonsense the grammar can't see
        return self.main_text + '\nresult = "str" + 1\n', len(lines)

    @staticmethod
    def _diag_key(d):
        s = (d.get("range") or {}).get("start") or {}
        return (d.get("message"), s.get("line"), s.get("character"))

    def p2_inject_type_error(self):
        injected, inj_line = self._inject_error()
        if self.client is None:
            tree = self.floor.parse(injected)
            cause = self.bus.emit("capability.probe.p2.inject", "value",
                                  {"injected": injected, "diagnostics": []},
                                  stage=STAGE)
            self.p2 = "fail"
            self.bus.emit("capability.probe.p2.verdict", "decision",
                          {"p2": "fail", "tier": "≤S"}, stage=STAGE, cause_id=cause)
            self.emit("p2", True, "fail",
                      {"injected": injected},
                      {"diagnostics": [], "parsedErrorNodes": tree.count("ERROR")},
                      "grammar-only floor produced NO diagnostic for an injected "
                      "semantic error — the silence that didn't come back",
                      "at best STRUCTURE; green forbidden")
            return
        self.client.did_change(self.main_uri, injected)
        # [ASSEMBLY CHANGE V1] real servers (pyright) stamp publishDiagnostics
        # with the document version; a stale version-1 publish queued from
        # didOpen must not be mistaken for the post-injection analysis.  The
        # reference shim sends no version field (None passes) — behavior for
        # the fixture languages is unchanged.
        # [ASSEMBLY CHANGE CAP-LEAN] settleDiagnostics profiles additionally
        # wait for the SETTLED post-change set (lean publishes progressively).
        # [ASSEMBLY CHANGE WC-W8] the accepted-version set now reads the
        # actual monotonic counter (spine_proto.did_change increments it) so
        # the second did_change (restore) below advances to the NEXT version
        # instead of colliding with the injection's — was hardcoded (None,2).
        cur = self.client.doc_versions.get(self.main_uri)
        if self.profile.get("settleDiagnostics"):
            note = self.client.wait_diagnostics_settled(
                self.main_uri, versions=(None, cur))
        else:
            note = self.client.wait_notification(
                "textDocument/publishDiagnostics",
                pred=lambda m: (m["params"]["uri"] == self.main_uri
                                and m["params"].get("version") in (None, cur)))
        diags = note["params"]["diagnostics"]
        # A pass is earned ONLY by a NEW error anchored at (or adjacent to) the
        # injected line — not by any pre-existing or unrelated diagnostic.
        baseline_keys = {self._diag_key(d) for d in self.baseline_diags}
        errors = [
            d for d in diags
            if d.get("severity") == 1
            and self._diag_key(d) not in baseline_keys
            and abs((d.get("range") or {}).get("start", {}).get("line", -99)
                    - inj_line) <= 1
        ]
        cause = self.bus.emit("capability.probe.p2.inject", "value",
                              {"injected": injected, "diagnostics": diags,
                               "injectedLine": inj_line,
                               "newErrorsAtInjection": errors},
                              stage=STAGE)
        self.p2 = "pass" if errors else "fail"
        self.bus.emit("capability.probe.p2.verdict", "decision",
                      {"p2": self.p2, "tier": "CT" if errors else "≤S"},
                      stage=STAGE, cause_id=cause)
        self.emit("p2", True, "pass" if errors else "fail",
                  {"method": "textDocument/didChange", "injected": injected},
                  diags,
                  ("a NEW error diagnostic anchored at the injected line came "
                   "back: %r" % errors[0]["message"]) if errors else
                  "NO new error diagnostic at the injected line — the server "
                  "does not run the real type checker (the zls shape)",
                  "real type checking ⇒ COMPILER-TRUTH" if errors else
                  "at best STRUCTURE; green forbidden")
        # restore the clean document so later probes see original positions
        self.client.did_change(self.main_uri, self.main_text)
        # [ASSEMBLY CHANGE WC-W8] gate on the actual (post-increment) version.
        cur = self.client.doc_versions.get(self.main_uri)
        if self.profile.get("settleDiagnostics"):
            self.client.wait_diagnostics_settled(
                self.main_uri, versions=(None, cur))
        else:
            self.client.wait_notification(
                "textDocument/publishDiagnostics",
                pred=lambda m: (m["params"]["uri"] == self.main_uri
                                and m["params"].get("version") in (None, cur)))
