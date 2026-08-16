"""The Handle — the membrane between this cell and Tree 3 (build prompt §5.4).

Tree 3 calls request("textDocument/definition", …) or walks parse(text) and maps
results into Node/Edge, setting Edge.resolved from OUR tier. This cell exposes
the capability; it never binds an edge (Out of scope §10).
"""

from __future__ import annotations


class Handle:
    def __init__(self, *, tier, kind, extractor, client=None, floor=None, scip=None):
        self.tier = tier                    # "CT" | "S" | "G" | "P" — MEASURED
        self.kind = kind                    # "lsp" | "treesitter" | "plaintext"
        #   ("scip" is reserved vocabulary — capability() never constructs a
        #    scip-kind handle; the SCIP index rides the .scip attribute)
        self.extractor = extractor          # provenance stamp, e.g. "ybg-lsp@ybc-1.4.0"
        self._client = client
        self._floor = floor
        self.scip = scip
        self.capabilities = client.capabilities if client else None
        self.positionEncoding = client.position_encoding if client else None
        self.nodeTypes = list(floor.nodeTypes) if floor else None

    # -- LSP-backed surface (CT / S) --------------------------------------
    def request(self, method, params):
        if self._client is None:
            raise RuntimeError(f"handle tier={self.tier} kind={self.kind} has no "
                               f"LSP surface — use parse()")
        return self._client.request(method, params)

    # -- tree-sitter-backed surface (G floor; present only when a stub
    #    grammar exists — python/lean have none this round, so parse() raises)
    def parse(self, text):
        if self._floor is None:
            raise RuntimeError("no grammar floor built for this language")
        return self._floor.parse(text)

    # -- lifecycle ---------------------------------------------------------
    @property
    def alive(self):
        return self._client.alive if self._client else True

    def restart(self):
        if self._client:
            self._client.restart()

    def shutdown(self):
        if self._client:
            self._client.shutdown()
