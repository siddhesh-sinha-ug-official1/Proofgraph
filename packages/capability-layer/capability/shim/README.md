# capability-layer/capability/shim

The spawned ybg LSP shim (`spine.shim_argv` target): `ybg_lsp.py` dispatches the LSP main loop, `ybg_state.py` holds state/framing/encoding math, `ybg_ybc.py` the compiler plumbing (every invocation a lead; failures surfaced, never swallowed), `ybg_handlers.py` and `ybg_symbols.py` the two handler halves. Structure-only and trickster modes stand in for weaker toolchains.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-capability-layer.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `__init__.py` | 0 | Empty package marker. |
| `ybg_lsp.py` | 105 | The spawned shim entry (spine.shim_argv target): bootstraps sys.path when run standalone, re-exports the four sibling modules, and dispatches the LSP main loop (initialize/didOpen/didChange/hover/definition/references/rename/documentSymbol/completion/shutdown/exit; unknown requests answered null with an honest stub lead). |
| `ybg_state.py` | 152 | Shim state + wire: env config (YBG_LSP_YBC_CMD/MODE/TMPDIR), STRUCTURE_LIKE covering structure-only and trickster, the STATE dict, framing read_msg (tolerates lowercase header and bare newline) and send, $/probe emission gated on serving so in-process unit tests stay silent, Windows-safe uri/path helpers, and encoding-aware byte-col<->char math in both directions. |
| `ybg_ybc.py` | 150 | Compiler plumbing: run_ybc (every invocation a lead; spawn failure and nonzero exit surfaced via shim.error, never swallowed), deterministic counter-named scratch files, line_text lookup (open doc first, disk fallback), map_ybc_diag (missing endCol -> col+1, unknown severity -> 3, missing position rejected — each a note), and diagnostics_for (trickster canned error / structure-only empty / compiler check with per-diagnostic check.diag + columnMap leads). |
| `ybg_handlers.py` | 163 | Handlers part 1: caps_for_mode (structure-only advertises a reduced provider set), initialize (encoding negotiation, ybc --version, per-mode serverInfo), position/scratch helpers, the structure-only stub, and hover/definition/references each backed by the matching `ybc query` subcommand with byte-col conversion to the negotiated encoding. |
| `ybg_symbols.py` | 110 | Handlers part 2: rename (old-name detection at the cursor + refs -> WorkspaceEdit.changes covering the full old name), documentSymbol (regex scan in structure mode; `ybc --emit=ast` in compiler mode), completion (`module.` prefix -> `ybc doc --format=json` items with signatures + docs). |
