"""The resolver-decision reason taxonomy (§6.13) — the honest-ceiling vocabulary.

Reason strings are enumerable data, not decoration: the histogram of these is
the cell's honesty made countable.  Spec strings are carried VERBATIM; the few
additions this round needs (design-stub / tier-gate reasons) are marked.
"""

# resolved reasons -----------------------------------------------------------
R_GRIMP = "bound via real import graph (grimp)"
R_PYRIGHT = "bound via Pyright inference"
R_LEAN_KERNEL = "bound via InfoTree resolved constant (kernel)"
# additions for the LEAN-DOCK round (driver is kernel/environment-level, NOT
# InfoTree — the spike deliberately avoided the version-sensitive surface):
R_LEAN_DRIVER = "bound via elaborated getUsedConstants (lean kernel driver)"
R_LEAN_IMPORT = "bound via elaborated header imports (lean kernel driver)"
R_LATEXML = "bound via LaTeXML idref→xml:id (two-pass)"
R_TYPST = "bound via typst-ide label resolution"

# unresolved reasons (LEADS — never edges) ----------------------------------
U_DYNAMIC = "dynamic dispatch (getattr/setattr)"
U_MONKEY = "monkeypatched target"
U_DYNIMPORT = "dynamic import (__import__/importlib)"
U_IMPORT_UNRESOLVED = "import could not be resolved"
U_OUTSIDE = "target outside ingested set"
U_UNDEF_REF = "undefined \\ref (no matching \\label)"
U_UNDEF_CITE = "undefined \\cite (not in bibliography)"
U_DANGLING_TYPST = "dangling @ref (Typst compile error)"
U_PINMAIN = "cross-file label needs pinned main (tinymist.pinMain)"
U_8840 = "axiom nested in another axiom's type (#8840)"
U_REFLECT = "reflection / DI edge not statically visible"
U_NODEF = "definition not found (Pyright returned no location)"          # addition
U_BACKEND_TIMEOUT = "backend timeout — candidate remains a lead"          # addition
U_BACKEND_ERROR = "backend error — candidate remains a lead"              # addition (C8)
# additions for this round's design-stub docks / tier seam:
U_TIER_G = "tier G (grammar floor): resolution forbidden — candidate remains a lead"
U_TIER_CAP = "tier cap: backend grade exceeds reported tier — candidate remains a lead"
U_STUB = "design-stub: backend not wired this round — candidate remains a lead"

# rejected reasons (not edges at all) ---------------------------------------
X_BUILTIN = "builtin (len/print/…)"
X_SELF = "self-recursion collapsed"
X_DUP = "duplicate of edge"
X_CORE = "core-library constant, core not ingested"
X_AUTOID = "auto-generated id not promoted to a node"
X_OUTPROJ = "target outside project root"
X_SRC_OUTSIDE = "source module not in ingested node set"                  # addition
X_TARGET_NOT_PROMOTED = "target not promoted to a node (excluded from ingest)"  # addition
X_NO_OWNER = "use-site has no owning declaration node"                    # addition (C2)


def histogram(decisions_by_dock: dict[str, list]) -> dict:
    """{perDock: {dock: {resolved:int, unresolved:{reason:count}, rejected:{reason:count}}}}"""
    per = {}
    for dock, decisions in sorted(decisions_by_dock.items()):
        res, unres, rej = 0, {}, {}
        for d in decisions:
            if d.outcome == "resolved":
                res += 1
            elif d.outcome == "unresolved":
                unres[d.reason] = unres.get(d.reason, 0) + 1
            else:
                rej[d.reason] = rej.get(d.reason, 0) + 1
        per[dock] = {"resolved": res,
                     "unresolved": dict(sorted(unres.items())),
                     "rejected": dict(sorted(rej.items()))}
    return {"perDock": per}
