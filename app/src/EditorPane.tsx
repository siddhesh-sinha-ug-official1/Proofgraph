/**
 * App-shell round — the editor pane: cell 4's Monaco tier behind its WALL,
 * wired exactly like the cell's own demo (worker wiring, fonts-ready gate,
 * MonacoEditorAdapter) but fed by the COMPOSED system:
 *
 *   schemaNodes  <- the hub-served, byte-gated /graph envelope (ids VERBATIM;
 *                   spans remapped to the open file's uri — the DECLARED
 *                   span-file-remap bound, logged in the status line)
 *   bus          <- the V5 joined bus's editor side (brushing both ways)
 *   capability   <- MEASURED, never asserted: hub-aggregated capability
 *                   stream (tier read VERBATIM from capability.wall.construct)
 *                   or the cell's own stub transport at tier "G" — grammar
 *                   floor, liveGreenAllowed false, NO live diagnostics claimed
 *                   — and it says so. Unknown never upgrades.
 *
 * SHELL ADDITIONS (this round):
 *   - the pane opens the FILE THE SHELL HANDS IT (per-tab; the shell keys this
 *     component by tab path, so a tab switch is dispose+mount — cell 4's
 *     one-document-per-instance bound, probed shell.editor.mount/.dispose);
 *   - user edits stream up (onUserEdit) for the dirty marker + buffer cache;
 *   - an imperative api (onEditorApi) exposes getText / Monaco BUILT-IN
 *     actions (undo/redo/find/replace — the Edit menu's targets) / focus;
 *   - diagnostics tapped off the CELL's own editor.lsp.in.diagnostics pin
 *     stream up (onDiagnostics) for the bottom-dock list;
 *   - editor font size preference applied via Monaco updateOptions (probed).
 *
 * This module is loaded LAZILY (React.lazy) — monaco + ?worker imports never
 * execute under jsdom/vitest.
 *
 * SUB200 restructure: this module stays the FACADE component — the probe /
 * capability resolution / node projection / diagnostics tap live in
 * editorPaneKit.ts, the Monaco worker wiring + EditorApi in
 * editorPaneMonaco.ts. Public surface unchanged (types re-exported).
 */

import React, { useEffect, useRef, useState } from "react";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";

import { createEditorWall, type EditorWall } from "@editor-shell/src/wall.js";
import { MonacoEditorAdapter } from "@editor-shell/src/mount/monaco/monaco-adapter.js";

import type { EnrichLogEntry } from "./lspTransport";
import { probeShell } from "./shellLog";
import {
  editorNodesFor, makeDiagnosticsTap, mountingDetail, probeHubCapability,
  readyDetail, resolveEditorCapability,
  type EditorPaneProps, type EditorPaneStatus,
} from "./editorPaneKit";
import { findEditorUnder, makeEditorApi } from "./editorPaneMonaco";

export { editorNodesFor } from "./editorPaneKit";
export type { EditorApi, EditorOpenFile, EditorPaneProps, EditorPaneStatus } from "./editorPaneKit";

export default function EditorPane({
  hubBase, bus, envelope, file, fontSize, onStatus, onUserEdit, onEditorApi, onDiagnostics,
}: EditorPaneProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<EditorWall | null>(null);
  const adapterRef = useRef<MonacoEditorAdapter | null>(null);
  const [status, setStatus] = useState<EditorPaneStatus>({
    phase: "probing", transport: null, tier: null, detail: "probing hub capability stream…",
  });
  const enrichLogRef = useRef<EnrichLogEntry[]>([]);

  const pushStatus = (s: EditorPaneStatus): void => {
    setStatus(s);
    onStatus?.(s);
  };

  useEffect(() => {
    let disposed = false;
    (async () => {
      await (document as Document & { fonts: FontFaceSet }).fonts.ready;
      if (disposed || !hostRef.current) return;

      const nodes = editorNodesFor(envelope, file.uri, file.relPath);
      const probe = await probeHubCapability(hubBase);
      if (disposed || !hostRef.current) return;

      const { capability, transport, tier } = resolveEditorCapability(probe, enrichLogRef.current, file.languageId);

      pushStatus({ phase: "mounting", transport, tier, detail: mountingDetail(transport, probe, tier) });

      try {
        const adapter = new MonacoEditorAdapter(hostRef.current);
        adapterRef.current = adapter;
        const wall = await createEditorWall({
          adapter,
          capability,
          bus,
          schemaNodes: nodes,
          file: {
            uri: file.uri,
            bytes: new TextEncoder().encode(file.content),
            languageId: file.languageId,
            lang: file.languageId,
          },
          connector: { maxReconnectAttempts: 2, backoffMs: [300, 600] },
        });
        if (disposed) {
          await wall.dispose("editor pane unmounted during open");
          return;
        }
        wallRef.current = wall;
        (window as unknown as { pgEditorWall: EditorWall }).pgEditorWall = wall; // spike surface (§7.8 discipline)
        probeShell("shell.editor.mount", {
          relPath: file.relPath, uri: file.uri, transport, tier,
          nodesIndexed: nodes.length,
          note: "one editor-wall instance per ACTIVE tab (cell 4 one-document bound)",
        });

        // user edits → dirty marker + buffer cache (origin \"user\" only —
        // programmatic edits are the cell's own repaint machinery).
        adapter.onDidChangeContent((e) => {
          if (e.origin === "user") onUserEdit?.(adapter.getText());
        });

        // diagnostics: the CELL's own pin stream, tapped verbatim.
        wall.pins.tap("editor.lsp.in.diagnostics", makeDiagnosticsTap(onDiagnostics));

        // Monaco built-in actions for the Edit menu (reuse, never reinvented).
        const editor = findEditorUnder(hostRef.current);
        if (editor !== null) {
          editor.updateOptions({ fontSize });
          onEditorApi?.(makeEditorApi(editor, adapter));
        } else {
          // no dead Edit menu: the shell disables the items with this reason.
          probeShell("shell.editor.api.unavailable", {
            relPath: file.relPath,
            reason: "mounted Monaco instance not found under the host node — Edit menu actions disabled with reason",
          });
          onEditorApi?.(null);
        }

        pushStatus({
          phase: "ready", transport, tier,
          detail: readyDetail(transport, enrichLogRef.current.length, nodes.length),
        });
      } catch (e) {
        pushStatus({
          phase: "failed", transport, tier,
          detail: `editor-mount-failed: ${e instanceof Error ? e.message : String(e)} — the pane refuses loudly, never renders a fake editor`,
        });
      }
    })();
    return () => {
      disposed = true;
      // snapshot the buffer BEFORE dispose so the tab cache survives the switch
      try {
        const text = adapterRef.current?.getText();
        if (text !== undefined && text !== "") onUserEdit?.(text);
      } catch { /* adapter already down */ }
      if (wallRef.current !== null) {
        probeShell("shell.editor.dispose", {
          relPath: file.relPath,
          reason: "tab switch or pane unmount — dispose+mount is the ONLY document-change path (one-document bound, never silent)",
        });
      }
      onEditorApi?.(null);
      void wallRef.current?.dispose("editor pane unmount (tab switch / shell teardown)");
      wallRef.current = null;
      adapterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubBase, envelope, file.relPath]);

  // font-size pref applies live to the mounted editor (probed by setPref).
  useEffect(() => {
    findEditorUnder(hostRef.current)?.updateOptions({ fontSize });
  }, [fontSize]);

  return (
    <div className="editor-pane-wrap">
      <div className={`pane-status pane-status-${status.phase}`}>
        <b>editor</b>
        {" · "}<code>{file.relPath}</code>
        {" · "}tier: <b>{status.tier ?? "?"}</b>
        {" · "}transport: <b>{status.transport ?? "probing"}</b>
        {" · "}{status.detail}
      </div>
      <div className="editor-host" ref={hostRef} />
    </div>
  );
}
