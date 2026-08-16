# capability-layer/testbed

Test doubles and probe repos. `mock_ybc.py` (+ `mock_ybc_lang.py`/`mock_ybc_query.py`) is the spawned stand-in compiler CLI the fixture configs target; the `*_repo` directories are fixture repos that the battery and real language servers walk, so no extra files should be added to them (the audited `python_repo` fixtures are folded into the table below).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-capability-layer.json`); each purpose line was written from the code itself and checked against the file's tests. Paths are relative to this directory.

| File | Lines | Verified purpose |
|---|---:|---|
| `mock_ybc.py` | 135 | Spawned stand-in compiler CLI (config ybc_argv target): --help/--version/check(--format=json)/query type\|def\|refs/doc --format=json/--emit=ast\|dump-symbols; exit 2 via die() on usage errors; stdout/stderr reconfigured to utf-8; columns documented and produced as 1-based UTF-8 byte offsets. |
| `mock_ybc_lang.py` | 101 | Mock-ybc internals part 1: the let/fn/import regex subset, the DOC corpus, io helpers, literal typing (String/Int/Float), byte_col, file_symbols, and check() — a real tiny declared-vs-literal type checker producing byte-accurate col/endCol diagnostics. |
| `mock_ybc_query.py` | 85 | Mock-ybc internals part 2: .ybg repo walk, byte-column token resolution, cross-file find_def/find_refs over file_symbols, and the --line/--col/--root positional argv parser. |
| `python_repo/main.py` | 18 | Python probe-repo entry: bare `helper(...)` call is the cross-file callee the battery's default `name(` scan finds (P4/P5/P7/P9), `lib.parse(...)` the dependency callee, and there is deliberately no `let` line so P2 falls through to the generic `result = "str" + 1` injection — layout claims verified against the battery's scan logic. |
| `python_repo/lib.py` | 15 | In-repo library fixture: parse/render/VERSION are the members pyright surfaces for the P6/inventory `import lib` + `lib.` scratch document. |
| `python_repo/util.py` | 5 | Cross-file callee fixture: defines helper(a: int) -> int, the P4/P5/P7/P9 target. |
