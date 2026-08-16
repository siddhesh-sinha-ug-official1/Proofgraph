/**
 * Default MountInfo reported by the StubEditorAdapter (SUB200 restructure:
 * split from stub-adapter.ts, values verbatim).
 */

import type { MountInfo } from "../../src/mount/adapter.js";

export const DEFAULT_MOUNT_INFO: MountInfo = {
  wrapperVersion: "stub-1.0.0",
  fontRequested: "JetBrains Mono",
  fontResolved: "JetBrains Mono",
  ligaturesOn: true,
  themeName: "proofgraph-darcula",
  tokenColorCount: 42,
  isDarculaStyle: true,
  features: {
    multiCursor: true,
    folding: true,
    minimap: true,
    findReplace: true,
    bracketMatching: true,
    semanticHighlighting: true,
  },
};
