# proofgraph/faultcheck — the fault-injection suite

`python faultcheck/run_faults.py` proves each guard actually fires: for
every catalog fault it builds a scratch tree copy, requires the control run
to PASS, injects the one anchored defect, requires the same suite to FAIL
carrying the guard's named failure class, and discards the scratch —
exit 0 iff every fault is CAUGHT. Six faults (a–e carved wave-2, the
f line-gate fault added wave-3); the full 6/6 CAUGHT record is
`REMEDIATION-REPORT.md` §3 take 2 (2026-08-03). Invoked by
`run_all_suites.py`. Injection mechanics and the fault catalog live in
`faultlib/` (see `faultlib/README.md`).

## Files (verified)

Verified purposes from `audit/AUDIT-acceptance.json` (which covered
faultcheck). Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `run_faults.py` | 152 | One-command facade of the fault-injection suite: for each catalog fault (filterable by key prefix) builds a scratch tree copy, requires the control run to pass, injects the one anchored defect, requires the same suite to fail carrying the guard's named class, discards the scratch; exits 0 iff every fault is CAUGHT; invoked by run_all_suites.py. |
