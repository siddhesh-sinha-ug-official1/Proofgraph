# acceptance/headless — browser/node drivers for the acceptance checks

Node CLI facades the checks spawn: the default step-3 UI driver
(`headless_ui.mjs`, six phases from `ui/` against a real Chromium
headless=new), the e-ai ask driver (`ai_check.mjs`), the g-squiggle V2
proof (`squiggle_check.mjs` with its staging/runner split in `squiggle/` —
two modules, tabled below) and the manual screenshot tool
(`browser_shot.mjs`, not in the gate). The six phase modules are tabled in
`ui/README.md`. (`audit/AUDIT-acceptance.json`)

## Files (verified)

Verified purposes from `audit/AUDIT-acceptance.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `ai_check.mjs` | 72 | Spawns an in-process createAiServer (fake transport) pointed at the runner's hub, POSTs one /ask question, emits a single evidence JSON line and exits 0 iff the ask round-tripped; content assertions are owned by checks/e_ai.py and c_h_ceiling.py. |
| `headless_ui.mjs` | 112 | CLI facade of the default step-3 UI driver: launches a found Chromium headless=new, runs the six phases from ui/*.mjs against the --url/--spec page, emits one evidence JSON line; exits 0 pass / 2 named-check fail / 3 browser-tooling-missing. |
| `browser_shot.mjs` | 174 | Manual screenshot tool (not in the gate): drives a headless Chromium against a live stack, captures overview/ai PNGs plus pin-derived facts, optional node-click brushing and DOM ask flow; exits 3 typed when no browser is found. |
| `squiggle_check.mjs` | 151 | CLI facade of the g-squiggle proof: spawns vessels/v2_hub_runner.py (real measured battery), mounts createEditorWall over the hub WS /lsp bridge on the staged temp variant, waits for the injected type-error diagnostic at the exact byte span, verifies guards/shutdown/fixture shas, emits evidence JSON lines. |
| `squiggle/stage.mjs` | 77 | Import-time staging for the squiggle check: copies moatpkg to a temp dir with the type-error line appended to core.py, computes expected byte offsets (ASCII-guarded, appends strictly after every span), builds the pyright-canonical URI and the remapped real analysis nodes, exposes fixture sha helpers. |
| `squiggle/runner.mjs` | 97 | The spawned-runner line protocol (Runner class: JSON stdout lines, cmd/next with stderr-tail timeouts) and V2's editor-side WebSocket MessageTransports including the single logged initialize enrichment. |
