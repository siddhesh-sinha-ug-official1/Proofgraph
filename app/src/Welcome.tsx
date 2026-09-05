/**
 * UI-1C round — the Welcome screen (shell-design README §Screens/views):
 * logo · version line (SOURCED from /health's schema pin — nothing invented)
 * · "Open sample workspace" (= the current hub workspace flow) · "New empty
 * workspace" (honest-disabled: the hub serves ONE declared workspace; an
 * empty one needs a hub-side declaration — no dead buttons, reason on title)
 * · RECENT list from pgshell.recents. Close project returns here.
 */

import React from "react";
import { LogoMark } from "./Header";
import { probeShell } from "./shellLog";
import type { RecentEntry } from "./prefs";

export default function Welcome(props: {
  schemaPin: { schemaVersion: string; schemaHash: string } | null;
  recents: RecentEntry[];
  isDesktop: boolean;
  onOpenFolder: (() => void) | null;
  onOpenSample: () => void;
  onOpenRecent: (r: RecentEntry) => void;
}): React.ReactElement {
  return (
    <div className="welcome" data-testid="welcome-screen">
      <div className="welcome-card">
        <LogoMark size={68} />
        <div className="welcome-title">Welcome to ProofGraph</div>
        <div className="welcome-ver">
          {props.schemaPin !== null
            ? <>assembly shell · schema {props.schemaPin.schemaVersion}/{props.schemaPin.schemaHash.slice(0, 8)}… (GET /health)</>
            : <>hub /health not served — no version is claimed</>}
        </div>
        <div className="welcome-actions">
          {props.onOpenFolder && (
            <button
              type="button" className="primary" data-testid="open-project-folder"
              onClick={() => {
                probeShell("shell.welcome.open-folder", { note: "native folder picker → POST /analyze {root}" });
                props.onOpenFolder!();
              }}
            >
              Open Project Folder
            </button>
          )}
          <button
            type="button" className={props.isDesktop ? "" : "primary"} data-testid="open-sample-workspace"
            onClick={() => {
              probeShell("shell.welcome.open-sample", { note: "the current hub workspace flow — /graph + /analysis + /workspace refetch" });
              props.onOpenSample();
            }}
          >
            Open sample workspace
          </button>
          {!props.isDesktop && (
            <button
              type="button" disabled
              title="the hub serves ONE declared workspace (serve_app declares the jail) — an empty workspace needs a hub-side declaration, not a browser guess"
            >
              New empty workspace
            </button>
          )}
        </div>
        <div className="welcome-recents">
          <div className="popup-head">RECENT</div>
          {props.recents.length === 0 && (
            <div className="popup-hint">nothing opened yet in this browser profile (localStorage pgshell.recents.v1)</div>
          )}
          {props.recents.slice(0, 6).map((r, i) => (
            <div key={i} className="popup-row" data-testid="welcome-recent" onClick={() => props.onOpenRecent(r)}>
              <span className="popup-ic">{r.kind === "folder" ? "▤" : "·"}</span>
              <span className="mono">{r.path || "(workspace root)"}</span>
              <span className="popup-right">{r.kind}</span>
            </div>
          ))}
        </div>
        {props.isDesktop && (
          <div className="welcome-shortcuts">
            <span className="shortcut-hint"><kbd>Ctrl+Shift+O</kbd> Open folder</span>
            <span className="shortcut-hint"><kbd>Ctrl+O</kbd> Open file</span>
            <span className="shortcut-hint"><kbd>Ctrl+Shift+A</kbd> Analyze</span>
          </div>
        )}
        <div className="welcome-foot">
          {props.isDesktop
            ? "ProofGraph Desktop — open any project folder to begin analysis"
            : "the hub serves /graph · /analysis · workspace fs — the browser never touches disk"}
        </div>
      </div>
    </div>
  );
}
