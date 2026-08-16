"""step 1 — the real outer wall on the three fixtures; analyses to disk.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

from .common import (ACCEPTANCE_DIR, FIXTURES, LEAN_CFG, MOAT_CFG,
                     analyze_session, bound, hub_pipeline)


def step1_analyze():
    print("== step 1: outer wall analyze() on the three acceptance fixtures ==",
          flush=True)
    moat = analyze_session(FIXTURES / "moatpkg", roots=["moatpkg.core"],
                           config=MOAT_CFG)
    lean = analyze_session(FIXTURES / "unused_hyp.lean", config=LEAN_CFG)
    ceiling = analyze_session(FIXTURES / "honest_ceiling.typ", config=LEAN_CFG)

    moat_bytes = hub_pipeline.canonical_json_bytes(moat["analysis"])
    lean_bytes = hub_pipeline.canonical_json_bytes(lean["analysis"])
    ceiling_bytes = hub_pipeline.canonical_json_bytes(ceiling["analysis"])
    (ACCEPTANCE_DIR / "analysis-moat.json").write_bytes(moat_bytes)
    (ACCEPTANCE_DIR / "analysis-lean.json").write_bytes(lean_bytes)
    (ACCEPTANCE_DIR / "analysis-ceiling.json").write_bytes(ceiling_bytes)
    print(f"   wrote analysis-moat.json ({len(moat_bytes)} canonical bytes), "
          f"analysis-lean.json ({len(lean_bytes)}), "
          f"analysis-ceiling.json ({len(ceiling_bytes)})", flush=True)

    # Remediation round: the moat package dir is no longer copy-staged — the
    # package-root-uri-mismatch bound is FIXED in cell 3 (pyright_backend
    # wire uris from didOpen'd absolute paths) and the outer wall extracts
    # the bare dir DIRECTLY; the root-normalization decision stays logged.
    staging = moat["staging"]
    if staging and staging.get("mode") == "direct":
        bound("package-root-uri-mismatch FIXED in cell 3 (remediation round) "
              "— moat package dir extracted DIRECTLY, no staging; decision "
              "logged on outerwall.root.staged (mode=direct); span.file is "
              "ingest-root-relative ('core.py', no 'moatpkg/' prefix — "
              "declared root-sensitivity)")
    elif staging:
        bound("moat source root staged; per-file sha256 logged on "
              f"outerwall.root.staged; byteIdentical={staging['byteIdentical']})")
    bound("cell-2 pin streams snapshotted before feed shutdown (V1 bound 4)")
    return moat, lean, ceiling, moat_bytes, lean_bytes, ceiling_bytes
