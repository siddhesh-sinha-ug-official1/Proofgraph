/**
 * Header popup clusters (SUB200 split of Header.tsx — no behavior change):
 * the project switcher (recents + Close project), the settings cog quick
 * menu, and the hub transport chip reading the REAL /health. Header.tsx
 * stays the facade component and owns the single-open-popup state.
 */

import React from "react";
import type { RecentEntry } from "./prefs";

export function ProjectSwitcher(p: {
  projectOpen: boolean;
  workspacePackage: string | null;
  workspaceRoot: string | null;
  recents: RecentEntry[];
  onOpenRecent: (r: RecentEntry) => void;
  onCloseProject: () => void;
  open: boolean;
  onToggle: () => void;
  act: (fn: () => void) => () => void;
}): React.ReactElement {
  return (
    <div className="header-pop-anchor">
      <button
        type="button" className="header-project" data-testid="project-switcher" title="project switcher"
        onClick={p.onToggle}
      >
        {p.workspacePackage ?? "proofgraph"}{" "}
        <span className="header-project-sub">
          {!p.projectOpen ? "(no project)" : p.workspaceRoot ?? "(workspace unserved)"}
        </span>
        <span className="header-caret">▾</span>
      </button>
      {p.open && (
        <div className="popup header-popup" role="menu" aria-label="project switcher">
          <div className="popup-head">RECENT PROJECTS</div>
          {p.recents.length === 0 && <div className="popup-hint">(no recents yet — localStorage pgshell.recents.v1)</div>}
          {p.recents.slice(0, 5).map((r, i) => (
            <div key={i} role="menuitem" tabIndex={0} className="popup-row" onClick={p.act(() => p.onOpenRecent(r))}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.act(() => p.onOpenRecent(r))(); } }}>
              <span className="popup-ic">{r.kind === "folder" ? "▤" : "·"}</span>
              <span className="mono">{r.path || "(workspace root)"}</span>
              <span className="popup-right">{r.kind}</span>
            </div>
          ))}
          <div className="menu-separator" role="separator" />
          <div role="menuitem" tabIndex={0} className="popup-row" data-testid="close-project" onClick={p.act(p.onCloseProject)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.act(p.onCloseProject)(); } }}>
            Close project
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsMenu(p: {
  theme: "light" | "dark";
  onTheme: (t: "light" | "dark") => void;
  onSettings: (page?: string) => void;
  open: boolean;
  onToggle: () => void;
  act: (fn: () => void) => () => void;
}): React.ReactElement {
  return (
    <div className="header-pop-anchor">
      <button
        type="button" className="header-iconbtn" data-testid="settings-cog"
        title="Settings — theme, accent (Ctrl+,)"
        onClick={p.onToggle}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="6" cy="4.5" r="1.8" fill="var(--cv)" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="11" cy="8" r="1.8" fill="var(--cv)" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="4.5" cy="11.5" r="1.8" fill="var(--cv)" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {p.open && (
        <div className="popup header-popup popup-right-align" role="menu" aria-label="settings quick menu">
          <div role="menuitem" tabIndex={0} className="popup-row" onClick={p.act(() => p.onTheme("light"))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.act(() => p.onTheme("light"))(); } }}>
            <span className="menu-item-check">{p.theme === "light" ? "✓" : ""}</span>Theme: Light
          </div>
          <div role="menuitem" tabIndex={0} className="popup-row" onClick={p.act(() => p.onTheme("dark"))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.act(() => p.onTheme("dark"))(); } }}>
            <span className="menu-item-check">{p.theme === "dark" ? "✓" : ""}</span>Theme: Dark
          </div>
          <div className="menu-separator" role="separator" />
          <div role="menuitem" tabIndex={0} className="popup-row" onClick={p.act(() => p.onSettings("plugins"))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.act(() => p.onSettings("plugins"))(); } }}>
            <span className="menu-item-check" />Plugins…
          </div>
          <div className="menu-separator" role="separator" />
          <div role="menuitem" tabIndex={0} className="popup-row" onClick={p.act(() => p.onSettings())}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.act(() => p.onSettings())(); } }}>
            <span className="menu-item-check" />Settings…<span className="popup-right">Ctrl+,</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function HubChip(p: { hubOk: boolean; hubPort: string; onHubChip: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className="hub-chip" data-testid="hub-chip"
      title={p.hubOk
        ? "hub transport — GET /health answered (schema pin served); click to re-probe"
        : "hub transport — /health unreachable; click to re-probe"}
      onClick={p.onHubChip}
    >
      <span className={`hub-dot ${p.hubOk ? "hub-dot-ok" : "hub-dot-down"}`} />
      {p.hubOk ? `hub :${p.hubPort}` : "hub down"}
    </button>
  );
}
