# faultcheck/faultlib — injection mechanics and the fault catalog

The library behind `../run_faults.py`: scratch-copy/junction/patch/plant/
discard mechanics (uniqueness-refusing anchored patches, overwrite-refusing
plants, tempdir-guarded discard) and the data-only catalog of the six fault
specs, each with its anchored defect, suite command and failure-class
signatures. All six anchors re-verified unique in the live tree during the
2026-08-03 audit. (`audit/AUDIT-acceptance.json`)

## Files (verified)

Verified purposes from `audit/AUDIT-acceptance.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `__init__.py` | 10 | Package docstring mapping harness.py and catalog.py; no code. |
| `harness.py` | 141 | The injection mechanics: robocopy scratch copies (node_modules/.git/caches/dist excluded), mklink /J junctions, uniqueness-refusing anchored patch(), overwrite-refusing plant(), tempdir-guarded discard() that unlinks junctions before rmtree, and signature-quoting excerpt(). |
| `catalog.py` | 135 | Data-only list of the six fault specs (key, guarantee, defect, inject lambda, suite cmd/cwd/junctions, failure-class signatures, timeout); all six anchors re-verified unique in the live tree this audit (fault a's post-SUB200 re-point to lean_ct_fill.py included). |
