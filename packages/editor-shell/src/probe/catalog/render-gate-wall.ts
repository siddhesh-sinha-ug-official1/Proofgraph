/** Catalog sections S8 render + S8b probe + S9 gate + wall (entries from §6;
 *  payloadType field lists refreshed in the adversarial claim audit to match
 *  the emitted payloads — probe.dump's full dump() snapshot, render.frame's
 *  kind, zorder's line, probe.history's eventCount, import.scan's fileCount). */

import { p, type ProbeSpec } from "./spec.js";

export const RENDER_PROBES: ProbeSpec[] = [
  // ── S8 render ───────────────────────────────────────────────────────────────
  p("editor.render.frame", "render", "timing",
    "{reason:'decoration'|'cursor'|'diagnostic'|'scroll',decorationsChanged,kind,wallNanos}",
    "Every render/paint cycle we triggered; the reason stream tells you what causes repaints.", true),
  p("editor.render.decoration.delta", "render", "value",
    "{added,removed,kept,kind:'gutter'|'outline'|'marker'|'highlight'}",
    "The decoration-set diff applied to the editor; the exact visual change per frame."),
  p("editor.render.decoration.zorder", "render", "decision",
    "{nodeId,line,overlapping,resolvedOrder}",
    "When a squiggle, a highlight and a gutter glyph collide on one line — which renders on top and why."),
  p("editor.render.paint.count", "render", "value", "{sinceOpen,sinceLastEdit}",
    "Cumulative paint counters; a runaway count on an idle editor signals a repaint storm."),
  p("editor.render.viewport", "render", "value",
    "{firstVisibleLine,lastVisibleLine,nodeIdsInView}",
    "Which lines/nodes are visible; distinguishes a missing glyph from one scrolled out of view."),
  p("editor.latency.keystroke.diagnostic", "render", "timing",
    "{keystrokeClock,didChangeClock,diagInClock,renderedClock,endToEndClockDelta,wallNanos}",
    "The full keystroke → didChange → publishDiagnostics → rendered chain; budget asserted on clock deltas."),
];

export const PROBE_PROBES: ProbeSpec[] = [
  // ── S8b probe ───────────────────────────────────────────────────────────────
  p("editor.probe.catalog", "probe", "value",
    "{probes:[{probeId,kind,payloadType,description}]}",
    "The output of probeCatalog(); every lead must appear here."),
  p("editor.probe.dump", "probe", "value",
    "{modelState,spanIndex,connState,pump,lastDiagnostics,decorations,verdicts,busLog,mountInfo,silentMutations}",
    "The full internal snapshot from dump()."),
  p("editor.probe.history", "probe", "value", "{eventCount,events:[ProbeEvent]}",
    "The ordered probe stream for the last run (deterministic by logicalClock/causeId)."),
];

export const GATE_PROBES: ProbeSpec[] = [
  // ── S9 gate ─────────────────────────────────────────────────────────────────
  p("editor.gate.import.scan", "gate", "value", "{declaredDeps,actualImports,fileCount}",
    "Declared vs actual imports at build time."),
  p("editor.gate.import.violation", "gate", "error",
    "{offendingImport,fromFile,reason:'outside-allowlist'}",
    "An import outside the allow-list; fails the build."),
  p("editor.gate.monaco.leak", "gate", "branch",
    "{fromModule,importedType,reason:'monaco-type-outside-mount'}",
    "A Monaco-only type imported anywhere but mount/monaco; would break the CodeMirror-6 swap."),
];

export const WALL_PROBES: ProbeSpec[] = [
  // ── Wall (ASSEMBLY Phase 1 — the cell's clean face; leads are additive) ────
  p("editor.wall.pin.check", "wall", "decision",
    "{wallVersion,schemaVersion,schemaHash,pass,reason}",
    "The schema-PIN assertion at wall construction: the wall's recorded pin vs the cell's verified-in-sync schema/pin copies. pass:false fires immediately before the failure-class=schema-pin-mismatch throw — a wall refuses to stand on a drifted schema, loudly."),
  p("editor.wall.mount", "wall", "state",
    "{wallVersion,uri,lang,nodeCount}",
    "The wall mounted its cell (open() resolved): the walking skeleton stands behind the face."),
  p("editor.wall.update.nodes", "wall", "input",
    "{nodeCount,accepted,reason}",
    "A neighbor delivered fresh schema nodes/verdicts through the wall's update(nodes) face. accepted:false (e.g. failure-class=wall-disposed) is probed before the throw — rejections are never silent."),
  p("editor.wall.dispose", "wall", "state",
    "{wallVersion,reason}",
    "Wall teardown delegated to the cell's dispose (didClose → shutdown → exit → adapter/connection teardown); idempotent, fires once."),
];
