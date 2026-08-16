/**
 * The Editor tool-window body (SUB200 split of App.tsx — no behavior change):
 * the tab strip (dirty dots, close guards) + the editor area. A tab switch is
 * DISPOSE+MOUNT (keyed by relPath — cell 4's one-document bound), and the
 * headless DisabledEditorHost runs the SAME keyed lifecycle where Monaco
 * cannot mount (jsdom), probed with the same ids. App.tsx is the facade.
 */

import React, { Suspense, useEffect } from "react";
import { probeShell } from "./shellLog";
import type { ShellCtx } from "./useShell";
import { isDirty } from "./tabsStore";

const EditorPane = React.lazy(() => import("./EditorPane"));

export function EditorWindowBody({ s }: { s: ShellCtx }): React.ReactElement {
  const { tabsSnap, tabs, activeTab } = s;
  return (
    <div className="editor-window-body">
      <div className="tab-strip" role="tablist" aria-label="editor tabs">
        {tabsSnap.tabs.map((t) => (
          <span key={t.relPath} className={`editor-tab ${t.relPath === tabsSnap.activePath ? "editor-tab-active" : ""}`}>
            <button type="button" role="tab" aria-selected={t.relPath === tabsSnap.activePath}
              className="editor-tab-label" data-tab={t.relPath}
              title={t.readOnlyReason ?? t.relPath}
              onClick={() => tabs.activate(t.relPath)}>
              {isDirty(t) && <span className="dirty-dot">●</span>}
              {t.relPath.split("/").pop()}
            </button>
            <button type="button" className="editor-tab-close" aria-label={`close ${t.relPath}`}
              title={isDirty(t) ? "unsaved changes — closing asks before discarding" : "close tab"}
              onClick={() => s.closeTab(t.relPath)}>✕</button>
          </span>
        ))}
        {tabsSnap.tabs.length === 0 && <span className="hint tab-strip-empty">no open files — File &gt; Open file…</span>}
      </div>
      <div className="editor-area">
        {activeTab === null ? (
          <div className="pane-status">no active editor tab</div>
        ) : s.disableEditor ? (
          // headless/test mode: the TAB LIFECYCLE (keyed dispose+mount)
          // still runs through this host — probed with the same ids.
          <DisabledEditorHost key={activeTab.relPath} relPath={activeTab.relPath} />
        ) : s.served !== null ? (
          <Suspense fallback={<div className="loading">loading Monaco tier…</div>}>
            <EditorPane
              key={activeTab.relPath} // tab switch = DISPOSE+MOUNT (one-document bound)
              hubBase={s.hubBase}
              bus={s.bus.editorSide}
              envelope={s.served.envelope}
              file={{ relPath: activeTab.relPath, uri: activeTab.uri, content: activeTab.buffer, languageId: activeTab.languageId }}
              fontSize={s.prefs.editorFontSize}
              onStatus={s.setEditorStatus}
              onUserEdit={(text) => tabs.updateBuffer(activeTab.relPath, text)}
              onEditorApi={s.setEditorApi}
              onDiagnostics={s.setDiagnostics}
            />
          </Suspense>
        ) : (
          <div className="pane-status">waiting for the served /graph envelope before mounting the editor wall…</div>
        )}
      </div>
    </div>
  );
}

/** Headless tab host: keyed like the real EditorPane so the DISPOSE+MOUNT
 *  lifecycle of a tab switch is exercised + probed even where Monaco cannot
 *  mount (jsdom). It renders an honest placeholder, never a fake editor. */
export function DisabledEditorHost({ relPath }: { relPath: string }): React.ReactElement {
  useEffect(() => {
    probeShell("shell.editor.mount", {
      relPath, editorDisabled: true,
      note: "headless host — same keyed dispose+mount path as the Monaco wall (one-document bound)",
    });
    return () => {
      probeShell("shell.editor.dispose", {
        relPath, editorDisabled: true,
        reason: "tab switch or pane unmount — dispose+mount is the ONLY document-change path (one-document bound, never silent)",
      });
    };
  }, [relPath]);
  return <div className="pane-status">editor disabled (test/headless mode) — active tab: <code>{relPath}</code></div>;
}
