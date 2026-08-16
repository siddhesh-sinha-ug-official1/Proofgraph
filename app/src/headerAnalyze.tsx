/**
 * Header analyze cluster (SUB200 split of Header.tsx — no behavior change):
 * the accent analyze split-button (primary analyze + declared-roots config
 * dropdown, with the honest-disabled per-file row) and the search-everywhere
 * button. Header.tsx stays the facade component and owns the popup state.
 */

import React from "react";
import { probeShell } from "./shellLog";

export function AnalyzeCluster(p: {
  analyzing: boolean;
  analyzeEnabled: boolean;
  analyzeReason: string;
  declaredRoots: string[];
  onAnalyze: () => void;
  onChooseRoots: () => void;
  onSearch: () => void;
  popOpen: boolean;
  onTogglePop: () => void;
  act: (fn: () => void) => () => void;
}): React.ReactElement {
  return (
    <>
      <div className="analyze-split">
        <button
          type="button" className="analyze-main" data-testid="analyze-button"
          disabled={!p.analyzeEnabled || p.analyzing}
          title={p.analyzeEnabled ? "POST /analyze — declared roots, never inferred" : p.analyzeReason}
          onClick={p.onAnalyze}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor" /></svg>
          {p.analyzing ? "analyzing…" : "analyze"}
        </button>
        <div className="header-pop-anchor">
          <button
            type="button" className="analyze-config" data-testid="analyze-config"
            title="analyze configuration"
            onClick={p.onTogglePop}
          >
            declared roots <span className="header-caret">▾</span>
          </button>
          {p.popOpen && (
            <div className="popup header-popup popup-right-align" role="menu" aria-label="analyze configuration">
              <div
                role="menuitem" className="popup-row"
                title="POST /analyze {roots} — roots are declared, never inferred"
                onClick={p.act(p.onAnalyze)}
              >
                <span className="menu-item-check">✓</span>
                declared roots {p.declaredRoots.length > 0 ? `(${p.declaredRoots.length})` : "(workspace default)"}
              </div>
              <div role="menuitem" className="popup-row" onClick={p.act(p.onChooseRoots)}>
                <span className="menu-item-check" />Choose declared roots…
              </div>
              <div className="menu-separator" role="separator" />
              <div
                role="menuitem" aria-disabled="true" className="popup-row menu-item-disabled"
                title="per-file analyze is not on the hub contract — /analyze takes declared roots"
                onClick={() => probeShell("shell.menu.blocked", { menu: "analyze-config", item: "current-file", reason: "per-file analyze is not on the hub contract" })}
              >
                <span className="menu-item-check" />current file only
              </div>
            </div>
          )}
        </div>
      </div>
      <button
        type="button" className="header-iconbtn" data-testid="search-everywhere-button"
        title="search everywhere — files and graph nodes" onClick={p.onSearch}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.2 10.2L13.6 13.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}
