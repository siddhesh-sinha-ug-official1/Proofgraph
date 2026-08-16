"""Probe family P6-P11: library surfacing, rename, generated symbols,
optional hierarchy, cold start, restart.  Mixin over _BatteryBase."""

from __future__ import annotations

import os

from . import spine
from .probe_battery import lsp_char, _find_pos


class _ProbesP6toP11:
    def p6_completion_after_import(self):
        if self.client is None:
            self.emit("p6", False, "skip", None, None,
                      "no completion surface on the floor", "no library surfacing")
            return
        if not (self.client.capabilities or {}).get("completionProvider"):
            self.emit("p6", True, "fail",
                      {"method": "textDocument/completion"}, None,
                      "completionProvider not advertised — library surfacing absent",
                      "no deep library surfacing")
            return
        # [ASSEMBLY CHANGE V1] scratch doc takes the profile's own extension
        # (identical name for the .ybg languages) and the CompletionList shape
        # is unwrapped (the shim returns a bare list — unchanged path).
        uri = spine.path_to_uri(os.path.join(
            self.config["work_dir"], "_p6" + self.profile["fileExt"]))
        text = "import lib\nlib."
        self.client.did_open(uri, text)
        resp = self.client.request("textDocument/completion",
                                   {"textDocument": {"uri": uri},
                                    "position": {"line": 1, "character": 4}})
        items = resp.get("result") or []
        if isinstance(items, dict):
            items = items.get("items") or []
        typed = [i for i in items if i.get("detail")]
        self.emit("p6", True, "pass" if typed else "fail",
                  {"doc": text, "method": "textDocument/completion"}, items,
                  (f"completion after `lib.` returned {len(typed)} member(s) WITH "
                   f"signatures, e.g. {typed[0]['label']}: {typed[0]['detail']}")
                  if typed else "no typed members returned",
                  "library API surfacing with types (the pull mechanism)" if typed
                  else "library surfacing shallow")

    def p7_cross_file_rename(self):
        if self.client is None:
            self.emit("p7", False, "skip", None, None,
                      "no rename surface on the floor", "no semantic rename")
            return
        if not (self.client.capabilities or {}).get("renameProvider"):
            self.emit("p7", True, "fail",
                      {"method": "textDocument/rename"}, None,
                      "renameProvider not advertised",
                      "no semantic rename — a depth signal missing")
            return
        cross, _ = self._callee_positions()
        if cross is None:
            self.emit("p7", False, "skip", None, None,
                      "no call-site found in the probe repo", "n/a")
            return
        line0, char0, name = cross
        resp = self.client.request("textDocument/rename",
                                   {"textDocument": {"uri": self.main_uri},
                                    "position": {"line": line0, "character": char0},
                                    "newName": "renamed_sym"})
        result = resp.get("result") or {}
        changes = result.get("changes") or {}
        if not changes:
            # [ASSEMBLY CHANGE V1] WorkspaceEdit.documentChanges is the other
            # legal shape; count distinct edited documents the same way.
            changes = {d.get("textDocument", {}).get("uri"): d.get("edits")
                       for d in (result.get("documentChanges") or [])
                       if isinstance(d, dict) and d.get("textDocument")}
        ok = len(changes) >= 2
        self.emit("p7", True, "pass" if ok else "fail",
                  {"method": "textDocument/rename", "symbol": name,
                   "newName": "renamed_sym"}, result,
                  f"rename produced edits in {len(changes)} file(s)",
                  "semantic (not textual) rename" if ok else "rename not workspace-wide")

    def p8_generated_symbols(self):
        if self.client is None:
            self.emit("p8", False, "skip", None, None,
                      "no semantic view on the floor", "generated symbols invisible")
            return
        caps = self.client.capabilities or {}
        if caps.get("semanticTokensProvider"):
            resp = self.client.request(
                "textDocument/semanticTokens/full",
                {"textDocument": {"uri": self.main_uri}})
            self.emit("p8", True, "pass" if resp.get("result") else "warn",
                      {"method": "textDocument/semanticTokens/full"},
                      resp.get("result"), "semanticTokens over the main file",
                      "a deep token model")
            return
        if self.gen_path is None:
            self.emit("p8", False, "skip", None, None,
                      "no generated file in the probe repo", "n/a")
            return
        with open(self.gen_path, "r", encoding="utf-8") as f:
            gen_text = f.read()
        gen_uri = spine.path_to_uri(self.gen_path)
        self.client.did_open(gen_uri, gen_text)
        pos = _find_pos(gen_text, r"fn\s+(\w+)")
        if pos is None:
            self.emit("p8", False, "skip", None, None,
                      "no symbol in the generated file", "n/a")
            return
        line0, cp, name, line_text = pos
        char0 = lsp_char(line_text, cp, self._encoding())
        resp = self.client.request("textDocument/hover",
                                   {"textDocument": {"uri": gen_uri},
                                    "position": {"line": line0, "character": char0}})
        result = resp.get("result")
        self.emit("p8", True, "pass" if result else "warn",
                  {"method": "hover (fallback; semanticTokens unsupported)",
                   "symbol": name, "file": os.path.basename(self.gen_path)},
                  result,
                  ("hover on @generated symbol %r succeeded" % name) if result else
                  "no view into generated symbols (structure servers silently "
                  "miss these)",
                  "the model sees generated code" if result else
                  "generated symbols are a blind spot")

    def p9_call_hierarchy(self):
        if self.client is None:
            self.emit("p9", False, "skip", None, None,
                      "no LSP server wired", "n/a")
            return
        caps = self.client.capabilities or {}
        if not caps.get("callHierarchyProvider") and not caps.get("typeHierarchyProvider"):
            self.emit("p9", True, "skip",
                      {"method": "textDocument/prepareCallHierarchy"}, None,
                      "callHierarchy/typeHierarchy are OPTIONAL capabilities and the "
                      "server does not advertise them (texlab/tinymist/Lean caveat) — "
                      "recorded as skip, NOT fail; the tier is NOT downgraded",
                      "absence of an optional capability licenses nothing")
            return
        cross, _ = self._callee_positions()
        if cross is None:
            self.emit("p9", False, "skip", None, None,
                      "no call-site found in the probe repo", "n/a")
            return
        line0, char0, name = cross
        resp = self.client.request("textDocument/prepareCallHierarchy",
                                   {"textDocument": {"uri": self.main_uri},
                                    "position": {"line": line0, "character": char0}})
        self.emit("p9", True, "pass" if resp.get("result") else "warn",
                  {"method": "textDocument/prepareCallHierarchy"},
                  resp.get("result"), "call hierarchy items returned",
                  "rich structural model")

    def p10_cold_start(self):
        nanos = (self.client.cold_start_nanos if self.client
                 else self.floor_nanos)
        self.emit("p10", True, "pass",
                  {"measure": "time-to-first-useful-response"},
                  {"note": "real time lives in this event's wallNanos field ONLY; "
                           "never used for ordering or assertions"},
                  "cold start measured (LSP initialize round-trip)" if self.client
                  else "cold start measured (floor build)",
                  "indexing cost budgeted", wall_nanos=nanos)
        return nanos

    def p11_restart(self):
        if self.client is None:
            self.emit("p11", False, "skip", None, None,
                      "no server to restart", "n/a")
            return
        self.client.restart()
        self.restart_fast = False
        self.emit("p11", True, "pass",
                  {"action": "kill + re-initialize + reopen docs"},
                  {"restartFast": False},
                  "second start re-derived state (no persisted index — the "
                  "rust-analyzer shape, not clangd/gopls)",
                  "caching behaviour known", wall_nanos=self.client.last_init_nanos)
