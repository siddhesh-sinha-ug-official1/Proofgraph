# acceptance/shellchecks — run_shell_demo.py's check families

The four flow modules (mapped by `__init__.py`) behind the app-shell
contract loop: the shared bootstrap/registry and helpers, the workspace-fs
read flow, the edit -> analyze -> revert flow, and the guard checks
(path-escape refusal, roots-candidates). (`audit/AUDIT-acceptance.json`)

## Files (verified)

Verified purposes from `audit/AUDIT-acceptance.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `__init__.py` | 11 | Package docstring mapping run_shell_demo's four check-family modules; no code. |
| `common.py` | 74 | Import-time bootstrap plus the shell demo's CHECKS registry, sha256/json-HTTP helpers and the fixture/root constants (declared root moatpkg.core.main, pyright live). |
| `flow_fs.py` | 55 | Checks workspace-facts, fs-list-tree and fs-read-core against GET /workspace, /fs/list and /fs/file; returns the workspace facts and core.py bytes for the analyze flow. |
| `flow_analyze.py` | 88 | Checks unused-initial, fs-write-edit, analyze-after-edit, unused-shrunk and revert-restores: PUT-edits the temp core.py so main calls unused_fn, POSTs the UI's exact /analyze body, asserts the unused set shrinks then returns byte-same on revert. |
| `flow_guards.py` | 43 | Checks path-escape-refused (traversal PUT 403 with the named class, probed hub.fs.rejected, nothing written) and roots-candidates-decls (/fs/roots-candidates equals the served non-module decl id set). |
