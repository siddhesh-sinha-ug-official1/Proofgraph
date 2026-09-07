/**
 * App-shell round — editor tab state (one wall instance for the ACTIVE tab —
 * cell 4's one-document-per-instance bound; a tab switch is dispose+mount,
 * PROBED on the shell log, never a silent remount).
 *
 * Pure state machine (no React, no DOM) so the lifecycle — open, activate,
 * buffer cache, dirty markers, unsaved-close guard — is unit-testable
 * directly. React binds via subscribe/getSnapshot (useSyncExternalStore).
 */

import { probeShell } from "./shellLog";

export interface TabState {
  relPath: string;      // workspace-relative (the hub fs key)
  uri: string;          // pyright-canonical editor uri
  languageId: string;
  savedContent: string; // last content known saved (or as loaded)
  buffer: string;       // current buffer (cached across tab switches)
  /** non-null = saving is refused with this reason (e.g. bundled-fixture fallback) */
  readOnlyReason: string | null;
  sha256: string | null;
}

/**
 * Derived dirty flag (pre-GitHub Wave-D L5): dirty was previously STORED on
 * TabState and could desync from the buffer/savedContent pair (the
 * unsaved-close guard's key input).  It is now DERIVED — one source of truth,
 * no desync trap.  The shell.tab.dirty probe still fires on transitions
 * (updateBuffer computes prev/next around the buffer assignment).
 */
export function isDirty(t: TabState): boolean {
  return t.buffer !== t.savedContent;
}

export interface TabsSnapshot {
  tabs: readonly TabState[];
  activePath: string | null;
}

export type ConfirmFn = (message: string) => boolean;

export class TabsStore {
  private tabs: TabState[] = [];
  private activePath: string | null = null;
  private listeners: Array<() => void> = [];
  private snapshot: TabsSnapshot = { tabs: [], activePath: null };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  };

  getSnapshot = (): TabsSnapshot => this.snapshot;

  private emit(): void {
    this.snapshot = { tabs: [...this.tabs], activePath: this.activePath };
    for (const fn of [...this.listeners]) fn();
  }

  find(relPath: string): TabState | undefined {
    return this.tabs.find((t) => t.relPath === relPath);
  }

  active(): TabState | null {
    return this.activePath === null ? null : this.find(this.activePath) ?? null;
  }

  /** Open (or re-activate) a tab. Activation of a different tab is the probed
   *  dispose+mount path — the ACTIVE editor wall is torn down and a new one
   *  mounted (cell 4's one-document bound; EditorHost enforces it via key). */
  open(file: Omit<TabState, "buffer">): void {
    const existing = this.find(file.relPath);
    if (existing === undefined) {
      this.tabs.push({ ...file, buffer: file.savedContent });
      probeShell("shell.tab.open", { relPath: file.relPath, uri: file.uri, languageId: file.languageId });
    }
    this.activate(file.relPath);
  }

  activate(relPath: string): void {
    if (this.find(relPath) === undefined) return;
    if (this.activePath === relPath) return;
    const from = this.activePath;
    this.activePath = relPath;
    probeShell("shell.tab.activate", {
      from, to: relPath,
      note: "tab switch = dispose+mount of the single editor-wall instance (cell 4 one-document bound; EditorHost key change)",
    });
    this.emit();
  }

  /** Buffer cache: user edits flow here; dirty is derived (isDirty). */
  updateBuffer(relPath: string, text: string): void {
    const t = this.find(relPath);
    if (t === undefined) return;
    const wasDirty = isDirty(t);
    t.buffer = text;
    const nowDirty = isDirty(t);
    if (nowDirty !== wasDirty) {
      probeShell("shell.tab.dirty", { relPath, dirty: nowDirty });
    }
    this.emit();
  }

  markSaved(relPath: string, content: string, sha256: string | null): void {
    const t = this.find(relPath);
    if (t === undefined) return;
    t.savedContent = content;
    t.buffer = content;
    t.sha256 = sha256;
    probeShell("shell.tab.saved", { relPath, sha256 });
    this.emit();
  }

  /** Unsaved-close guard: a dirty tab needs the user's explicit discard.
   *  Returns true when the tab was closed. Refusals + discards both probed. */
  requestClose(relPath: string, confirm: ConfirmFn): boolean {
    const t = this.find(relPath);
    if (t === undefined) return false;
    if (isDirty(t)) {
      const ok = confirm(`${relPath} has unsaved changes. Discard them and close the tab?`);
      if (!ok) {
        probeShell("shell.tab.close.blocked-dirty", { relPath, note: "user kept the dirty tab — close refused, buffer intact" });
        return false;
      }
      probeShell("shell.tab.close.discarded", { relPath, note: "user confirmed discard of unsaved changes" });
    }
    const idx = this.tabs.findIndex((x) => x.relPath === relPath);
    this.tabs.splice(idx, 1);
    probeShell("shell.tab.close", { relPath });
    if (this.activePath === relPath) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)] ?? null;
      this.activePath = next === null ? null : next.relPath;
      if (next !== null) {
        probeShell("shell.tab.activate", {
          from: relPath, to: next.relPath,
          note: "auto-activate after close (dispose+mount)",
        });
      }
    }
    this.emit();
    return true;
  }
}
