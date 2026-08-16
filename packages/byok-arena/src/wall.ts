// ============================================================================
// Phase-1 WALL — byok-arena's minimal, clean, versioned, typed face.
// Promoted OVER the cell's diagnostic pins, never replacing them: everything
// createCell() exposes still exists; the wall wraps it and narrows what a
// neighbor is invited to consume (SEAM-MAP V6):
//
//   createByokWall(config) → { validateKey, chat, submitToolResults,
//                              estimateCost, pins } + WALL_VERSION
//
// The four methods delegate to the cell's adapters/cost machinery with the
// SAME normalized types (interface.ts) — the wall adds no shapes of its own
// beyond provider dispatch and the named failure classes.
//
// masterSecret is REQUIRED here. The cell keeps its dev default for
// standalone runs; the WALL is the assembled face and refuses it loudly
// (failure class insecure-master-secret).
//
// NO schema PIN assert — this cell is schema-absent BY DESIGN (test-enforced
// by the import-boundary gate + the no-node/edge-kind catalog test). The wall
// asserts at construction that the absence STAYS (failure class
// schema-absence-violated). See MEMBRANE-SPEC.md.
//
// FACADE: the implementation is split by cohesion under ./wall/ —
//   types.ts (version, failure classes, every face type) and
//   construct.ts (createByokWall with both construction gates + dispatch).
// This module path keeps the wall's full public surface for the hub and the
// conformance tests — external importers need zero changes.
// ============================================================================

export {
  WALL_VERSION, INSECURE_DEV_MASTER_SECRET, WallRefusal,
} from "./wall/types.ts";
export type {
  WallFailureClass, ByokWallConfig, WallChatRequest, WallSubmitRequest,
  WallValidateKeyResult, WallPins, ByokWall,
} from "./wall/types.ts";
export { createByokWall } from "./wall/construct.ts";
