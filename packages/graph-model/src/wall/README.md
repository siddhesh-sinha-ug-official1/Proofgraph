# graph-model/src/wall

The Phase-1 GraphModelWall: `base.py` (wall constants, the hard-coded schema PIN, WallRejection with its 16 named classes, the pins accessor and the probe-before-raise refusal mixin), `core.py` (assembly + `create_wall`, which checks the PIN before anything else runs), `ingest.py` (the VERIFY-NOT-MINT ingest checks 0-6), `queries.py` (the query/project/verdictOf read faces). Consumed through the `wall.py` facade at the cell root.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-model.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `__init__.py` | 12 | Assembles and exports the wall package surface (base constants + WallRejection + _WallPins from base, GraphModelWall + create_wall from core); ../wall.py re-exports exactly this. |
| `base.py` | 86 | Wall foundation: WALL_VERSION, the hard-coded canonical schema PIN (v0 / 3f312369...), UNRESOLVED_PREFIX, node-id regex, QUERY_KINDS/PROJECT_KINDS, WallRejection (extends GateFailure, 16 named classes), _WallPins (cell quartet + wall state under dump()['wall']), and the _RefusalMixin that probes every rejection on the named lead BEFORE raising. |
| `core.py` | 49 | GraphModelWall assembly (mixin composition) + create_wall factory: at construction reads schema/schema.json, check_pins it against the hard-coded PIN (WallRejection schema-pin-mismatch on drift, nothing else runs), then probes wall.version; exposes the pins property. |
| `ingest.py` | 143 | VERIFY-NOT-MINT ingest: deep-copies inputs, then (0) leads-segregation pre-scan both directions, (1) validate_graph envelope check, (2) node-id format+uniqueness (preimage verification documented impossible from Node fields), (3) every edge AND lead id recomputed via the canonical mint and byte-compared, (4) unresolved: placeholder on lead dstIds, (5) greenGuard: green requires origin=checked plus a fill.source that is neither empty nor the skeleton default, (6) roots must be declared non-module node ids; probes each decision, stores state, returns the accepted summary. |
| `queries.py` | 143 | Wall read faces: query() (reachable/unused via rustworkx with mandatory networkx equality else t3-library-disagreement, roots at query time or ingest-declared else roots-undeclared; sccs; condensation with is-DAG invariant) over non-module nodes and edges within that universe; project() ('graph' canonical envelope snapshot, 'flat' rows with T3-derived labels or None without roots, 'text' always refused projection-unavailable-no-source); verdictOf() pass-through of stored fill/outline (null preserved). All results probed then deep-copied out. |
