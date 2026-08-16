"""Fixture data, part 1: the ten mandated index sources + the language
profiles (see fixtures.py, the facade, for the full parallel-build-seam
story).  Data is element-for-element identical to the original."""

# The ten index sources every sweep MUST consult (one source.query lead each).
INDEX_SOURCES = [
    {"source": "nvim-lspconfig",
     "url": "https://github.com/neovim/nvim-lspconfig/tree/master/lua/lspconfig/configs"},
    {"source": "mason-registry",
     "url": "https://github.com/mason-org/mason-registry"},
    {"source": "langserver.org", "url": "https://langserver.org/"},
    {"source": "helix-languages",
     "url": "https://github.com/helix-editor/helix/blob/master/languages.toml"},
    {"source": "zed-languages", "url": "https://zed.dev/docs/languages"},
    {"source": "toolchain-docs",
     "url": "<the language's own 'editor support' docs>"},
    {"source": "tree-sitter-index",
     "url": "https://github.com/tree-sitter/tree-sitter/wiki/List-of-parsers "
            "+ tree-sitter-grammars org + tree-sitter-language-pack"},
    {"source": "scip-index",
     "url": "https://github.com/sourcegraph/scip + https://lsif.dev/"},
    {"source": "github-search",
     "url": "https://github.com/search?q=%22<lang>+language+server%22&s=updated"},
    {"source": "registry", "url": "<the language's package registry>"},
]

PROFILES = {
    "yaddabinggiberish": {
        "lang": "yaddabinggiberish",
        "fileExt": ".ybg",
        "compilerCLI": "ybc",
        "typing": "static",
        "packageMgr": "ybpm",
    },
    "awk": {
        "lang": "awk",
        "fileExt": ".awk",
        "compilerCLI": None,   # awk executes; it exposes no analysis surface
        "typing": "dynamic",
        "packageMgr": None,
    },
    "zigish": {
        "lang": "zigish",
        "fileExt": ".ybg",     # dialect sharing the .ybg surface (fixture convenience)
        "compilerCLI": None,   # the community server is the only tooling
        "typing": "static",
        "packageMgr": None,
    },
    # [ASSEMBLY CHANGE V1] real python profile.  Additive keys:
    #   languageId — LSP languageId for didOpen (pyright keys analysis off it;
    #                the other profiles keep the historical default).
    #   probeRepo  — testbed repo dir the battery measures against.
    # typing: "static" answers the S2 rubric question "does a REAL static
    # checker exist?" — pyright is that checker.  Python-the-runtime is
    # dynamically typed; the battery, not this flag, decides the tier.
    "python": {
        "lang": "python",
        "fileExt": ".py",
        "compilerCLI": None,   # CPython exposes no analysis surface; pyright is the tooling
        "typing": "static",
        "packageMgr": "pip",
        "languageId": "python",
        "probeRepo": "python_repo",
    },
    # [ASSEMBLY CHANGE CAP-LEAN] real lean profile.  Additive keys beyond V1's
    # languageId/probeRepo (each one MEASURED against the live server before it
    # was added; fixture-language behavior is unchanged — every key defaults
    # to the historical path when absent):
    #   p2Injection      — the appended P2 payload.  The generic injection
    #                      `result = "str" + 1` is a Lean PARSE error, not a
    #                      type error; `example : Nat := "s"` elaborates and
    #                      fails in the type checker ("Type mismatch … String
    #                      … Nat", severity 1, anchored at the injected line).
    #   settleDiagnostics— lean publishes diagnostics PROGRESSIVELY per
    #                      elaboration snapshot (measured: didOpen publishes
    #                      [] twice before the real set).  The battery's
    #                      diagnostics waits settle via $/lean/fileProgress
    #                      before reading the final publish.
    #   crossCallPattern / depCallPattern — Lean application is whitespace-
    #                      sensitive: `f(x)` is a parse error, `f (x)` is the
    #                      call form (measured on v4.32.0).  The historical
    #                      ybg-shaped scan patterns `name(` can therefore
    #                      never match VALID lean source; these override the
    #                      battery's call-site scan, group 1 = callee name.
    # typing: "static" answers the S2 rubric question — Lean's checker is the
    # kernel itself.  The battery, not this flag, decides the tier.
    "lean": {
        "lang": "lean",
        "fileExt": ".lean",
        "compilerCLI": None,   # the server ships inside the toolchain; lake drives it
        "typing": "static",
        "packageMgr": "lake",
        "languageId": "lean4",
        "probeRepo": "lean_repo",
        "p2Injection": 'example : Nat := "s"',
        "settleDiagnostics": True,
        "crossCallPattern": r"^\s*(\w+)\s+\(",
        "depCallPattern": r"\.(\w+)\s+\(",
    },
}
