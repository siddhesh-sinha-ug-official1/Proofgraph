/**
 * Vessel V2 connector test — capability wall → editor wall: the LSP squiggle,
 * end-to-end, against a SPAWNED hub process (vessels/v2_hub_runner.py).
 *
 *   pyright (cell 2's measured spawn form, fresh child per session)
 *     ⇄ hub WS /lsp bridge (content-opaque, ledgered)
 *     ⇄ real MessageTransports over Node 24's built-in WebSocket
 *     ⇄ editor wall (createEditorWall, StubEditorAdapter, HEADLESS)
 *
 * EVERY connector assertion reads BOTH sides' pins across the boundary:
 * editor-shell probe events (wall.pins) × capability-layer probe events
 * (capability.probe.msg stage=bridge, capability.wall.construct /
 * measuredTier via the runner + hub /pins aggregation) × the hub bridge
 * ledger.  Never a return value alone.
 *
 * Run:  node --test vessels/test_v2_squiggle.mjs   (from proofgraph/)
 *
 * DECLARED transport adaptation (logged, never silent — see REPORT-V2.md):
 * the assembly-side WS transport enriches ONLY the editor's `initialize`
 * frame with clientCapabilities.workspace.configuration=true.  The composed
 * client genuinely has that capability (the editor pump answers
 * workspace/configuration — pump.ts), the editor cell just doesn't advertise
 * it; without the advertisement pyright never SENDS the request (spike-
 * verified), and the brief requires the round-trip proven.  pyright then
 * gates its analysis on the answers, so the squiggle's arrival is behavioral
 * proof the answers returned.
 *
 * SUB200 restructure: this file stays the `node --test` ENTRY POINT (same
 * path, same invocation — one spawned hub, one process); the suite body now
 * lives in the imported case modules, registered in the original order:
 *
 *   v2_squiggle_env.mjs     shared fixture/env + spawned-hub before/after
 *   v2_squiggle_cases.mjs   measured-tier honesty · the end-to-end squiggle
 *   v2_squiggle_drop.mjs    backend-kill drop scenario · teardown/orphans
 */
import "./v2_squiggle_cases.mjs";
import "./v2_squiggle_drop.mjs";
