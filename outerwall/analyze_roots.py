"""analyze_roots.py — source-root normalization + root re-declaration.

SUB200 restructure: split out of outerwall/analyze.py (which stays the
facade; its module docstring carries the full staging/root spec).  Behavior
identical: single-file staging sha256-pinned; package dirs extract DIRECT
since the remediation round; roots are declared, never inferred; every
decision logged.
"""
from __future__ import annotations

import hashlib
import re
import shutil
import tempfile
from pathlib import Path

from . import OuterLog, UnknownRootDeclared

_NODE_ID_RE = re.compile(r"^n_[0-9a-f]{16}\Z")


def _sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def cleanup_staging(record) -> None:
    """[H8] Remove the single-file staging scratch tempdir if any.  The
    caller (analyze_run.analyze_session) MUST invoke this in a finally so
    the outerwall-stage-* mkdtemp created by _normalize_root doesn't leak
    once per analyze — the pipeline holds the path for the extract, but
    nothing on the return path needs the physical files (staging.files is
    the sha256 dict computed at staging time)."""
    if not record or record.get("mode") != "staged":
        return
    staged = record.get("stagedRoot")
    if staged:
        shutil.rmtree(staged, ignore_errors=True)


def _normalize_root(src: Path, log: OuterLog):
    """Return (extraction_root, staging_record|None) — see analyze.py's
    module docstring."""
    if src.is_file():
        scratch = Path(tempfile.mkdtemp(prefix="outerwall-stage-"))
        dst = scratch / src.name
        shutil.copyfile(src, dst)
        record = {
            "mode": "staged",
            "reason": "single-file source root — the extractor walks dirs",
            "original": str(src), "stagedRoot": str(scratch),
            "files": {src.name: _sha256_file(dst)},
            "byteIdentical": _sha256_file(src) == _sha256_file(dst),
            "idInvariance": ("node preimages use ingest-root-relative paths; "
                             "the staged rel path equals the file name"),
        }
        log.emit("outerwall.root.staged", record)
        return scratch, record

    if src.is_dir() and (src / "__init__.py").exists():
        # Remediation round: the former copy-staging of bare package dirs is
        # RETIRED.  It worked around cell 3's package-root-uri-mismatch bound
        # (didOpen uris joined from ingest-relative rels onto the detected
        # package-PARENT project root -> live definition lookups returned []
        # and calls degraded to leads).  The cell fix is applied
        # (pyright_backend wire uris are built from the didOpen'd ABSOLUTE
        # paths and mapped back into the dock's rel vocabulary), so the bare
        # dir extracts DIRECTLY and resolves live.  The probe stays and
        # records the decision — a no-longer-staged root is still a root-
        # normalization decision, never silent.
        record = {
            "mode": "direct",
            "reason": ("source root IS a python package dir — extracted "
                       "DIRECTLY: the package-root-uri-mismatch bound is "
                       "FIXED in cell 3 (remediation round), no staging"),
            "bound": "package-root-uri-mismatch",
            "boundState": ("fixed-in-cell: extractor/docks/pyright_backend.py "
                           "builds LSP wire uris from the didOpen'd absolute "
                           "paths under the detected project root"),
            "original": str(src), "extractionRoot": str(src),
            "consequence": ("span.file / node ids stay INGEST-root-relative: "
                            "a bare-dir extract mints 'core.py', not "
                            "'<pkg>/core.py' — declared root-sensitivity of "
                            "the structural identity, never smoothed away; "
                            "the relation set (names, edge kinds, resolution "
                            "outcomes) is unchanged vs a parent-root extract "
                            "(asserted by cell 3's bare-dir oracle test)"),
        }
        log.emit("outerwall.root.staged", record)
        return src, record

    return src, None


def _expand_module_members(module_node: dict, nodes: list[dict], root_repr: str,
                           decisions: list[dict], log: OuterLog,
                           declared: list[str]) -> list[str]:
    """Direct decl members of a module node — the V3 root-vocabulary
    translation applied UNIFORMLY to both the module-id branch and the
    module-name branch of _resolve_roots.

    Round W7 (Wave B): extracted into ONE helper so the empty-members guard
    fires the same way whichever branch expands the module.  The pre-round
    module-id branch expanded without the guard, silently yielding
    resolved=[] for an all-module-id root set — analyze_run.py then skips
    ingest.roots (its `if declared:` short-circuits) and the run behaves as
    roots-undeclared while the byte-identical name-spelling raised.
    """
    members = [n["id"] for n in nodes if n["kind"] != "module"
               and n["name"].rsplit(".", 1)[0] == module_node["name"]]
    if not members:
        decisions.append({"root": root_repr,
                          "outcome": "module-without-decl-members"})
        log.emit("outerwall.roots.resolve",
                 {"declared": declared, "ok": False,
                  "decisions": decisions})
        raise UnknownRootDeclared(
            f"declared module root {root_repr!r} has no decl members — an "
            f"all-module root set has no model-wall vocabulary "
            f"(root-vocabulary-mismatch, V3)")
    return members


def _resolve_roots(envelope: dict, roots, log: OuterLog) -> list[str]:
    if not roots:
        log.emit("outerwall.roots.resolve",
                 {"declared": [], "resolved": [], "decisions": [],
                  "note": "no roots declared — reachable/unused will refuse "
                          "honestly downstream (roots-undeclared)"})
        return []
    nodes = envelope["nodes"]
    by_id = {n["id"]: n for n in nodes}
    resolved: list[str] = []
    decisions: list[dict] = []
    declared_repr = list(map(str, roots))
    for r in declared_repr:
        if _NODE_ID_RE.match(r):
            node = by_id.get(r)
            if node is None:
                decisions.append({"root": r, "outcome": "unknown-id"})
                log.emit("outerwall.roots.resolve",
                         {"declared": declared_repr, "ok": False,
                          "decisions": decisions})
                raise UnknownRootDeclared(
                    f"declared root id {r!r} is not in the extracted envelope")
            if node["kind"] == "module":
                # Round W7: same helper as the module-name branch — empty
                # decl members raises UnknownRootDeclared instead of silently
                # returning [] (which analyze_run.py would then skip ingest
                # roots for, degrading to roots-undeclared).
                members = _expand_module_members(node, nodes, r, decisions,
                                                 log, declared_repr)
                decisions.append({"root": r, "outcome": "module-id-expanded",
                                  "members": members})
                resolved.extend(members)
            else:
                decisions.append({"root": r, "outcome": "id-passthrough"})
                resolved.append(r)
            continue
        exact = [n for n in nodes if n["name"] == r]
        decl = [n for n in exact if n["kind"] != "module"]
        mods = [n for n in exact if n["kind"] == "module"]
        if len(decl) == 1:
            decisions.append({"root": r, "outcome": "name-resolved",
                              "id": decl[0]["id"]})
            resolved.append(decl[0]["id"])
        elif len(decl) == 0 and len(mods) == 1:
            members = _expand_module_members(mods[0], nodes, r, decisions,
                                             log, declared_repr)
            decisions.append({"root": r, "outcome": "module-name-expanded",
                              "module": mods[0]["id"], "members": members,
                              "ruling": ("V3 root-vocabulary translation: "
                                         "extractor roots are NAMES (modules "
                                         "allowed), model roots are DECL ids "
                                         "— module expands to direct decl "
                                         "members, logged")})
            resolved.extend(members)
        else:
            decisions.append({"root": r, "outcome": "unresolvable",
                              "declMatches": [n["id"] for n in decl],
                              "moduleMatches": [n["id"] for n in mods]})
            log.emit("outerwall.roots.resolve",
                     {"declared": list(map(str, roots)), "ok": False,
                      "decisions": decisions})
            raise UnknownRootDeclared(
                f"declared root {r!r} resolves to {len(decl)} decl nodes and "
                f"{len(mods)} module nodes — the outer wall never guesses")
    out = sorted(dict.fromkeys(resolved))
    log.emit("outerwall.roots.resolve",
             {"declared": list(map(str, roots)), "resolved": out,
              "ok": True, "decisions": decisions})
    return out
