/**
 * UI-1C round — the 44px tool-window rail (34px buttons, radius 9px):
 * Project · Editor on top, AI · Diagnostics · Pins on the bottom, Settings
 * last. Icon active-state = accent tint when its window is open; every click
 * routes through the probed toggle reducer (the View menu mirrors these).
 */

import React from "react";
import type { LayoutV2, WinId } from "./layout2";

const ICONS: Record<WinId, React.ReactElement> = {
  project: (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3.5h4l1.4 1.5H14v8H2z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  editor: (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.5 4L2.5 8l3 4M10.5 4l3 4-3 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ai: (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5L9.4 6.1 14 8l-4.6 1.4L8 14.5 6.6 9.4 2 8l4.6-1.9z" fill="currentColor" />
    </svg>
  ),
  diag: (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2L14.5 13.5H1.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r=".9" fill="currentColor" />
    </svg>
  ),
  pins: (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4.5l4 3.5-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

const TITLES: Record<WinId, string> = {
  project: "Project tool window (Ctrl+Shift+E)",
  editor: "Editor tool window",
  ai: "AI outlet tool window",
  diag: "Diagnostics tool window",
  pins: "Pins console tool window",
};

export default function Rail(props: {
  layout: LayoutV2;
  onToggle: (id: WinId) => void;
  onSettings: () => void;
}): React.ReactElement {
  const btn = (id: WinId): React.ReactElement => (
    <button
      key={id}
      type="button"
      className={`rail-btn ${props.layout.wins[id].open ? "rail-btn-active" : ""}`}
      data-testid={`rail-${id}`}
      aria-pressed={props.layout.wins[id].open}
      title={TITLES[id]}
      onClick={() => props.onToggle(id)}
    >
      {ICONS[id]}
    </button>
  );
  return (
    <div className="rail" data-testid="rail">
      {btn("project")}
      {btn("editor")}
      <span className="rail-spacer" />
      {btn("ai")}
      {btn("diag")}
      {btn("pins")}
      <button type="button" className="rail-btn rail-settings" title="Settings (Ctrl+,)" onClick={props.onSettings}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
