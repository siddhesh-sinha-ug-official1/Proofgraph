"""faultcheck.faultlib — the fault-injection harness + the fault catalog.

SUB200 restructure (wave 2): carved VERBATIM out of
faultcheck/run_faults.py (behavior-preserving; the runner remains the
ONE-COMMAND facade — same CLI, same filter args, same output format).

    harness.py   scratch copies, junctions, anchored patches, excerpts
    catalog.py   the SIX faults (worklist item 4.1 a–e + the wave-3
                 line-gate fault f), data only
"""
