/**
 * Settings — Appearance page (SUB200 split of SettingsDialog.tsx — no behavior
 * change): theme cards + FREE accent picker (color input + hex field + 4
 * swatches). The accent drives --acc ONLY — verdict fills are proof semantics
 * and stay canonical (said on the page, enforced by import).
 * SettingsDialog.tsx stays the facade and owns page + accent-draft state.
 */

import React from "react";
import { ACCENT_SWATCHES, type Prefs } from "./prefs";

export type PrefChange = <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;

export function AppearancePage(p: {
  prefs: Prefs;
  change: PrefChange;
  accentDraft: string | null;
  setAccent: (raw: string) => void;
  clearDraft: () => void;
}): React.ReactElement {
  const { prefs, change } = p;
  return (
    <div className="settings-stack">
      <div>
        <b>Theme</b>
        <div className="theme-cards">
          <button
            type="button" data-testid="theme-card-light"
            className={`theme-card theme-card-light ${prefs.theme === "light" ? "theme-card-active" : ""}`}
            onClick={() => change("theme", "light")}
          >Light (New UI)</button>
          <button
            type="button" data-testid="theme-card-dark"
            className={`theme-card theme-card-dark ${prefs.theme === "dark" ? "theme-card-active" : ""}`}
            onClick={() => change("theme", "dark")}
          >Dark (New UI)</button>
        </div>
      </div>
      <div>
        <b>Accent</b>
        <div className="accent-row">
          <input
            type="color" value={prefs.accentColor} aria-label="accent color picker"
            title="pick any accent color"
            onChange={(e) => p.setAccent(e.target.value)}
          />
          <input
            className="accent-hex mono" value={p.accentDraft ?? prefs.accentColor}
            aria-label="accent hex"
            onChange={(e) => p.setAccent(e.target.value)}
          />
          <span className="accent-divider" />
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c} type="button" title={c}
              className={`accent-swatch ${prefs.accentColor === c ? "accent-swatch-active" : ""}`}
              style={{ background: c }}
              onClick={() => { change("accentColor", c); p.clearDraft(); }}
            />
          ))}
        </div>
        <div className="hint">
          any color you like — verdict fills (green · amber · red · blue · unknown) stay canonical:
          they are proof semantics, never theme
        </div>
      </div>
    </div>
  );
}
