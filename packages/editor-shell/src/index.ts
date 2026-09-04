/**
 * ProofGraph Tree 4 — Editor Shell cell. Public surface (deliberately WIDE:
 * everything exposed — probe-everything rule). Since ASSEMBLY Phase 1 the membrane
 * exists as ./wall.js (createEditorWall), promoted OVER these pins, not a
 * replacement: the wide surface stays exported for tests/demo.
 */

export * from "./probe/catalog.js";
export * from "./probe/probe-bus.js";
export * from "./schema/schema.js";
export * from "./seams/capability.js";
export * from "./seams/bus.js";
export * from "./mount/adapter.js";
export * from "./mount/mount.js";
export * from "./buffer/buffer-manager.js";
export * from "./conn/connector.js";
export * from "./lsp/pump.js";
export * from "./diagnostics/diagnostics.js";
export * from "./verdict/verdict.js";
export * from "./selection/selection.js";
export * from "./map/span-index.js";
export * from "./render/render.js";
export * from "./gate/import-gate.js";
export * from "./cell.js";
export * from "./util/encoding.js";
export * from "./util/sha256.js";
// ASSEMBLY Phase 1 (additive): the wall + the verified-in-sync PIN copy.
export * from "./schema/pin.js";
export * from "./wall.js";
