"""acceptance.shellchecks — run_shell_demo's contract-loop check families.

SUB200 restructure (wave 2): carved VERBATIM out of
acceptance/run_shell_demo.py (behavior-preserving; the runner remains the
ONE-COMMAND facade — same CLI, same output format).  Module map:

    common.py        env bootstrap + check registry + http/sha helpers
    flow_fs.py       open folder / explorer / open core.py (GET flows)
    flow_analyze.py  edit → analyze → unused shrinks → revert → determinism
    flow_guards.py   the /fs jail (path-escape) + the root-picker feed
"""
