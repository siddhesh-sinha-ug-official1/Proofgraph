/**
 * Darcula-style token-color map (Monaco theme = a JSON token-color map,
 * §7.7e) + marker severity table — SUB200 restructure: split from
 * monaco-adapter.ts, values verbatim. Monaco-only module (inside
 * src/mount/monaco/, per the S9 gate).
 */

import * as monaco from "monaco-editor";

export const PROOFGRAPH_DARCULA: monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "A9B7C6", background: "2B2B2B" },
    { token: "keyword", foreground: "CC7832" },
    { token: "string", foreground: "6A8759" },
    { token: "comment", foreground: "808080", fontStyle: "italic" },
    { token: "number", foreground: "6897BB" },
    { token: "type", foreground: "A9B7C6" },
    { token: "identifier", foreground: "A9B7C6" },
    { token: "delimiter", foreground: "A9B7C6" },
    { token: "attribute.name", foreground: "BBB529" },
  ],
  colors: {
    "editor.background": "#2B2B2B",
    "editor.foreground": "#A9B7C6",
    "editor.lineHighlightBackground": "#323232",
    "editorLineNumber.foreground": "#606366",
    "editorGutter.background": "#313335",
    "editor.selectionBackground": "#214283",
  },
};

export const SEVERITY: Record<string, monaco.MarkerSeverity> = {
  error: 8, // monaco.MarkerSeverity.Error
  warning: 4,
  info: 2,
  hint: 1,
};
