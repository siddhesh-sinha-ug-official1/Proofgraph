"""Probe family P3-P5 (+ position helpers): inference hover, cross-file
definition, references.  Mixin over probe_battery._BatteryBase."""

from __future__ import annotations

import re

from .probe_battery import STAGE, lsp_char, _find_pos


class _ProbesP3toP5:
    @staticmethod
    def _hover_text(result):
        """Extract the actual hover TEXT from the three LSP contents shapes.
        Verdicts must run against real text, never repr(dict) (which always
        contains ': ')."""
        if not result:
            return ""
        contents = result.get("contents") if isinstance(result, dict) else result
        parts = []

        def add(c):
            if isinstance(c, str):
                parts.append(c)
            elif isinstance(c, dict):
                parts.append(str(c.get("value", "")))
            elif isinstance(c, list):
                for x in c:
                    add(x)

        add(contents)
        return "\n".join(p for p in parts if p)

    def p3_hover_inferred(self):
        if self.client is None:
            self.emit("p3", False, "skip", None, None,
                      "no hover surface on the floor", "no inference claim")
            return
        pos = _find_pos(self.main_text, r"let\s+(\w+)\s*=\s")
        if pos is None:
            self.emit("p3", False, "skip", None, None,
                      "no unannotated let in the repo", "n/a")
            return
        line0, cp, name, line_text = pos
        char0 = lsp_char(line_text, cp, self._encoding())
        resp = self.client.request("textDocument/hover",
                                   {"textDocument": {"uri": self.main_uri},
                                    "position": {"line": line0, "character": char0}})
        result = resp.get("result")
        text = self._hover_text(result)
        # the hover must actually STATE a type for the unannotated symbol
        ok = bool(re.search(r"\b%s\s*:\s*\S" % re.escape(name), text))
        self.emit("p3", True, "pass" if ok else "fail",
                  {"method": "textDocument/hover", "symbol": name},
                  result,
                  ("hover on unannotated %r returned an INFERRED type" % name)
                  if ok else
                  ("hover returned %r — no real inference" % result),
                  "real type inference (not annotation echo)" if ok else
                  "no type truth behind hover")

    def _callee_positions(self):
        """(line0,char0,name) of a cross-file callee and of a dependency callee.
        char0 is already converted to the negotiated position encoding.

        [ASSEMBLY CHANGE CAP-LEAN] the scan patterns are per-profile
        overridable (group 1 = callee name).  The historical ybg-shaped
        defaults require `name(`, which is a PARSE ERROR in lean (application
        is whitespace-sensitive: `f (x)` — measured on v4.32.0), so the lean
        profile supplies patterns matching its own valid call surface.
        Fixture languages keep the historical defaults byte-for-byte."""
        cross = dep = None
        enc = self._encoding()
        cross_pat = self.profile.get("crossCallPattern", r"^\s*(\w+)\(")
        dep_pat = self.profile.get("depCallPattern", r"\.(\w+)\(")
        for i, line in enumerate(self.main_text.split("\n")):
            m = re.search(cross_pat, line)
            if m and cross is None and ("fn " + m.group(1)) not in self.main_text:
                cross = (i, lsp_char(line, m.start(1), enc), m.group(1))
            m = re.search(dep_pat, line)
            if m and dep is None:
                dep = (i, lsp_char(line, m.start(1), enc), m.group(1))
        return cross, dep

    @staticmethod
    def _definition_uri(result):
        """[ASSEMBLY CHANGE V1] the target uri from any legal definition shape:
        Location | Location[] | LocationLink[].  The reference shim returns a
        single Location dict (unchanged path); real servers (pyright) return
        Location[]."""
        if isinstance(result, list):
            result = result[0] if result else None
        if isinstance(result, dict):
            return result.get("uri") or result.get("targetUri")
        return None

    def p4_cross_file_definition(self):
        if self.client is None:
            self.emit("p4", False, "skip", None, None,
                      "no definition surface on the floor "
                      "(goto is a same-file heuristic lead, resolved=false)",
                      "no cross-file claim")
            return
        cross, dep = self._callee_positions()
        evidence, responses = [], []
        hits = 0
        for label, target in (("cross-file", cross), ("dependency", dep)):
            if target is None:
                evidence.append(f"{label}: no call-site found")
                continue
            line0, char0, name = target
            resp = self.client.request("textDocument/definition",
                                       {"textDocument": {"uri": self.main_uri},
                                        "position": {"line": line0,
                                                     "character": char0}})
            result = resp.get("result")
            responses.append({label: result})
            target_uri = self._definition_uri(result)
            if target_uri and target_uri != self.main_uri:
                hits += 1
                evidence.append(f"{label}: {name!r} resolved to {target_uri}")
            else:
                evidence.append(f"{label}: {name!r} did NOT resolve ({result!r})")
        verdict = "pass" if hits == 2 else ("warn" if hits == 1 else "fail")
        self.emit("p4", True, verdict,
                  {"method": "textDocument/definition",
                   "targets": [cross, dep]}, responses,
                  "; ".join(evidence),
                  "cross-file resolution + dependency indexing" if hits == 2
                  else "workspace semantics incomplete")

    def p5_references(self):
        if self.client is None:
            self.emit("p5", False, "skip", None, None,
                      "no references surface on the floor", "no workspace claim")
            return
        cross, _ = self._callee_positions()
        if cross is None:
            self.emit("p5", False, "skip", None, None, "no call-site found", "n/a")
            return
        line0, char0, name = cross
        resp = self.client.request("textDocument/references",
                                   {"textDocument": {"uri": self.main_uri},
                                    "position": {"line": line0, "character": char0},
                                    "context": {"includeDeclaration": True}})
        result = resp.get("result") or []
        max_refs = self.config.get("max_refs")
        if max_refs is not None and len(result) > max_refs:
            self.bus.emit("capability.probe.cap", "value",
                          {"what": "P5 references truncated at top-N",
                           "cap": max_refs, "dropped": len(result) - max_refs},
                          stage=STAGE)
            result = result[:max_refs]
        uris = {loc["uri"] for loc in result}
        ok = len(uris) >= 2
        self.emit("p5", True, "pass" if ok else "fail",
                  {"method": "textDocument/references", "symbol": name}, result,
                  f"references for {name!r} span {len(uris)} file(s)",
                  "workspace-wide semantic index (not textual grep)" if ok
                  else "no repo-wide reference truth")
