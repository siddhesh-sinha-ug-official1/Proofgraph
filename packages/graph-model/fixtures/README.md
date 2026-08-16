# graph-model/fixtures

Deterministic fixture inputs for the suite. The sample `.py` files and their manifest/roots JSON are byte-frozen fixture data (exempt from the doc audit; `sample.py` is pinned to the Appendix-B golden sha); they are regenerated only by `make_fixtures.py`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-model.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `make_fixtures.py` | 119 | Deterministic fixture writer: regenerates sample.py (72 bytes, asserted against the Appendix-B golden sha), unresolved_ref.py, rejected_ref.py, sample_reflowed.py (81 bytes, same logical file with moved spans) plus their manifests/roots files, LF-endings via write_bytes; byte counts in the manifests verified against the written strings. |
