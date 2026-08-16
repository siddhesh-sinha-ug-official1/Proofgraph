# byok-arena/src/wall

The Phase-1 wall internals: `types.ts` (WALL_VERSION, the refused dev secret, the three failure classes, every face type - masterSecret is REQUIRED) and `construct.ts` (createByokWall: masterSecret gate before any cell exists, schema-absence assertion over the catalog, face dispatch with typed unknown-provider refusal, the pins quartet).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `types.ts` | 93 | WALL_VERSION pin, the refused dev secret constant, the three WallFailureClass values with the WallRefusal error, and every face type (ByokWallConfig with REQUIRED masterSecret, WallChatRequest/WallSubmitRequest/WallValidateKeyResult, WallPins quartet + leak scan, ByokWall); imported by construct.ts and re-exported by wall.ts. |
| `construct.ts` | 139 | createByokWall refuses missing/empty/dev-default masterSecret with a typed WallRefusal BEFORE any cell exists, wraps createCell (delegation, no reimplementation), probes the masterSecret gate + asserts schema absence over the catalog (no node/edge kinds, no schema.* leads; violation throws schema-absence-violated) + probes wall.construct, then dispatches the four face methods through adapterFor (unknown provider → wall.reject probe + WallRefusal) and exposes the pins quartet + runSecretLeakScan. |
