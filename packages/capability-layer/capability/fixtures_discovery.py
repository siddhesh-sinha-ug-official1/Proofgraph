"""Fixture data, part 2: per-language discovery answers, the known-dead
server list, and the S6 license classification sets.  Data is
element-for-element identical to the original fixtures.py."""

# source -> hits (per language). A hit is a CandidateServer dict.
DISCOVERY = {
    "yaddabinggiberish": {
        "hits": {},  # every index: nothing (the DIY / "Abracadabra" path)
        "grammar": {"exists": True, "partial": True,
                    "source": "community gist (partial; forked into the cell's stub floor)"},
        "scip": {"indexer": None},
        "libSources": [
            {"kind": "doc-json", "ref": "ybc doc --format=json"},
            {"kind": "registry", "ref": "ybg.dev/pkg"},
        ],
        "registryPackages": [
            {"name": "lib", "version": "1.0.0", "description": "core parse/render"},
            {"name": "yb-http", "version": "0.4.2", "description": "http client"},
            {"name": "yb-test", "version": "0.2.0", "description": "test harness"},
        ],
    },
    "awk": {
        "hits": {
            "nvim-lspconfig": [{
                "name": "awk-language-server", "steward": "community",
                "source": "nvim-lspconfig", "lastRelease": "2023-09-15",
                "lastCommit": "2024-11-02", "license": "MIT",
                "reusesCompiler": False, "archived": False,
                # the architecture fact discovery records verbatim:
                "note": "the 'server' IS the tree-sitter tree; no semantic layer",
                "semanticLayer": False, "installable": False,
            }],
            "mason-registry": [{
                "name": "awk-language-server", "steward": "community",
                "source": "mason-registry", "lastRelease": "2023-09-15",
                "lastCommit": "2024-11-02", "license": "MIT",
                "reusesCompiler": False, "archived": False,
                "note": "present in mason (weak maintenance signal only)",
                "semanticLayer": False, "installable": False,
            }],
            "tree-sitter-index": [],
        },
        "grammar": {"exists": True, "partial": False,
                    "source": "tree-sitter-awk (grammar index)"},
        "scip": {"indexer": None},
        "libSources": [],
        "registryPackages": [],
    },
    # [ASSEMBLY CHANGE V1] python discovery data — fixture-answered like every
    # other language (the sweep seam is unchanged); the CANDIDATE is real
    # (pyright, MIT, Microsoft-stewarded) and the wired server is the real one.
    "python": {
        "hits": {
            "nvim-lspconfig": [{
                "name": "pyright", "steward": "microsoft",
                "source": "nvim-lspconfig", "lastRelease": "2026-06-27",
                "lastCommit": "2026-07-15", "license": "MIT",
                # CPython has no type-checking frontend to reuse — pyright IS
                # the reference static type checker for the language.  Recorded
                # as the compiler-truth-candidate claim; P2 tests it live.
                "reusesCompiler": True, "archived": False,
                "note": "pyright IS the type authority for python (CPython "
                        "does not type-check); paper claim — the probe "
                        "battery measures it",
                "claimsCrossFile": True, "claimsTypedCompletion": True,
                "semanticLayer": True, "installable": True,
            }],
            "mason-registry": [{
                "name": "pyright", "steward": "microsoft",
                "source": "mason-registry", "lastRelease": "2026-06-27",
                "lastCommit": "2026-07-15", "license": "MIT",
                "reusesCompiler": True, "archived": False,
                "note": "present in mason (install channel)",
                "claimsCrossFile": True, "claimsTypedCompletion": True,
                "semanticLayer": True, "installable": True,
            }],
        },
        "grammar": {"exists": True, "partial": False,
                    "source": "tree-sitter-python (grammar index) — NOT wired "
                              "into this cell's stub floor runtime (logged "
                              "bound: no G fallback for python this round)"},
        "scip": {"indexer": "scip-python (lags pyright; not used — see cell 3 D2)"},
        "libSources": [
            {"kind": "typeshed-stubs", "ref": "bundled with pyright"},
        ],
        "registryPackages": [],
    },
    # [ASSEMBLY CHANGE CAP-LEAN] lean discovery data — fixture-answered like
    # every other language (the sweep seam is unchanged); the CANDIDATE is
    # real (the Lean 4 language server ships INSIDE the toolchain, Apache-2.0,
    # leanprover-stewarded) and the wired server is the real one.
    "lean": {
        "hits": {
            "toolchain-docs": [{
                "name": "lean4-language-server", "steward": "leanprover",
                "source": "toolchain-docs", "lastRelease": "2026-06-27",
                "lastCommit": "2026-07-10", "license": "Apache-2.0",
                # The watchdog spawns `lean` worker processes — the elaborator
                # ITSELF answers every request.  Recorded as the
                # compiler-truth-candidate claim; P2 tests it live.
                "reusesCompiler": True, "archived": False,
                "note": "the server ships inside the toolchain: the watchdog "
                        "spawns `lean` file workers — the elaborator is the "
                        "server; paper claim — the probe battery measures it",
                "claimsCrossFile": True, "claimsTypedCompletion": True,
                "semanticLayer": True, "installable": True,
            }],
            "nvim-lspconfig": [{
                "name": "lean4-language-server", "steward": "leanprover",
                "source": "nvim-lspconfig", "lastRelease": "2026-06-27",
                "lastCommit": "2026-07-10", "license": "Apache-2.0",
                "reusesCompiler": True, "archived": False,
                "note": "listed as leanls (spawned via `lake serve`)",
                "claimsCrossFile": True, "claimsTypedCompletion": True,
                "semanticLayer": True, "installable": True,
            }],
        },
        "grammar": {"exists": True, "partial": False,
                    "source": "tree-sitter-lean (community, grammar index) — "
                              "NOT wired into this cell's stub floor runtime "
                              "(logged bound: no G fallback for lean this "
                              "round)"},
        "scip": {"indexer": None},
        "libSources": [
            {"kind": "doc-json",
             "ref": "doc-gen4 (Lean documentation generator; not wired this "
                    "round)"},
        ],
        "registryPackages": [],
    },
    "zigish": {
        "hits": {
            "github-search": [{
                "name": "zg-analyzer", "steward": "community",
                "source": "github-search", "lastRelease": "2026-04-11",
                "lastCommit": "2026-06-30", "license": "MIT",
                # the README CLAIMS — the probe will contradict them:
                "reusesCompiler": True, "archived": False,
                "note": "README: 'powered by the zigish compiler frontend' "
                        "(unverified paper claim)",
                "claimsCrossFile": True, "claimsTypedCompletion": True,
                "semanticLayer": True, "installable": True,
            }],
        },
        "grammar": {"exists": True, "partial": False,
                    "source": "tree-sitter-zigish (grammar index)"},
        "scip": {"indexer": None},
        "libSources": [],
        "registryPackages": [],
    },
}

# Stage B: the known-dead list (candidates refused with capability.gate.archived).
ARCHIVED_SERVERS = {
    "erlang_ls",                     # archived Aug 2025
    "kotlin-language-server",        # fwcd — deprecated
    "elm-language-server",           # stale, no 2025–26 releases
    "v-analyzer",                    # stalled since Feb 2025
    "buf-language-server",           # standalone archived (use `buf lsp serve`)
    "typst-lsp",                     # → tinymist
    "Perl::LanguageServer",          # stale (2023)
    "taplo",                         # absentee maintainer
}

# Stage B: license classification (S6 axis).
PERMISSIVE = {"MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "ISC",
              "NCSA", "0BSD", "Unlicense", "CC0-1.0", "BSL-1.0"}
COPYLEFT_SUBPROCESS_ONLY = {"GPL-2.0", "GPL-3.0", "LGPL-2.1", "LGPL-3.0",
                            "AGPL-3.0", "MPL-2.0"}
VETO = {"closed", "BUSL", "proprietary"}
