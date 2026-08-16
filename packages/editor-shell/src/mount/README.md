# editor-shell/src/mount

S0 mount: `adapter.ts` defines the editor-agnostic EditorAdapter contract (1-based utf-16 positions, utf-16 rangeOffsets); `mount.ts` emits the mount lifecycle probes from adapter truth. The only sanctioned Monaco implementation lives in `monaco/`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `adapter.ts` | 116 | The editor-agnostic EditorAdapter interface plus its coordinate conventions (1-based utf-16 positions, utf-16 rangeOffsets) and supporting types (ContentChange/CursorEvent/Decoration/MountInfo); implemented by StubEditorAdapter and MonacoEditorAdapter. |
| `mount.ts` | 110 | S0 MountController: emits the mount lifecycle probes (config.input -> wrapper.init -> wrapper.ready -> font/theme/features/readonly probes, error, dispose) from adapter.mountInfo() truth; used by the cell's open sequence. |
