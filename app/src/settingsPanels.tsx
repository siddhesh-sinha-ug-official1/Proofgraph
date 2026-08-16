/**
 * Settings — Editor·Font / Analysis / Plugins pages (SUB200 split of
 * SettingsDialog.tsx — no behavior change): stepper 10–18px (bounds shared
 * with prefs.ts, clamped); pyright live/none · auto-reanalyze-on-save · graph
 * node cap; and the HONEST static list of the REAL composed pieces (not a
 * fake marketplace). SettingsDialog.tsx stays the facade.
 */

import React from "react";
import { FONT_SIZE_MAX, FONT_SIZE_MIN, type Prefs } from "./prefs";
import type { PrefChange } from "./settingsAppearance";

export interface ComposedPiece {
  name: string;
  version: string | null;
  role: string;
}

export function EditorFontPage(p: {
  prefs: Prefs;
  change: PrefChange;
  fontStep: (d: number) => void;
}): React.ReactElement {
  const { prefs } = p;
  return (
    <div className="settings-stack">
      <div>
        <b>Editor font size</b>
        <div className="stepper-row">
          <button
            type="button" aria-label="decrease font size"
            disabled={prefs.editorFontSize <= FONT_SIZE_MIN}
            title={prefs.editorFontSize <= FONT_SIZE_MIN ? `already at the ${FONT_SIZE_MIN}px floor` : "smaller"}
            onClick={() => p.fontStep(-1)}
          >−</button>
          <input
            type="number" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX}
            value={prefs.editorFontSize} aria-label="editor font size"
            onChange={(e) => {
              const v = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(Number(e.target.value) || 0)));
              p.change("editorFontSize", v);
            }}
          />
          <button
            type="button" aria-label="increase font size"
            disabled={prefs.editorFontSize >= FONT_SIZE_MAX}
            title={prefs.editorFontSize >= FONT_SIZE_MAX ? `already at the ${FONT_SIZE_MAX}px ceiling` : "larger"}
            onClick={() => p.fontStep(+1)}
          >+</button>
          <span className="hint">px · bounds {FONT_SIZE_MIN}–{FONT_SIZE_MAX} (clamped, clamp persisted)</span>
        </div>
        <div className="hint">Monaco keeps the cell&apos;s own darcula theme (cell-owned, not overridden)</div>
      </div>
    </div>
  );
}

export function AnalysisPage(p: { prefs: Prefs; change: PrefChange }): React.ReactElement {
  const { prefs, change } = p;
  return (
    <div className="settings-stack">
      <div>
        <b>Pyright</b>
        <div className="radio-stack">
          <label>
            <input type="radio" name="pyright" checked={prefs.pyrightMode === "live"} onChange={() => change("pyrightMode", "live")} />
            live — resolve cross-module calls over the hub bridge
          </label>
          <label>
            <input type="radio" name="pyright" checked={prefs.pyrightMode === "none"} onChange={() => change("pyrightMode", "none")} />
            none — cross-module calls stay LEADS (honest)
          </label>
        </div>
      </div>
      <label className="check-row">
        <input
          type="checkbox" checked={prefs.autoReanalyzeOnSave}
          onChange={(e) => change("autoReanalyzeOnSave", e.target.checked)}
        />
        Re-analyze automatically on save (POST /analyze after every successful PUT /fs/file)
      </label>
      <div>
        <b>Graph node cap</b>
        <div className="stepper-row">
          <input
            type="number" min={1} placeholder="cell default (1500)"
            value={prefs.graphMaxNodes ?? ""} aria-label="graph node cap"
            onChange={(e) => {
              const raw = e.target.value.trim();
              change("graphMaxNodes", raw === "" ? null : Math.max(1, Math.round(Number(raw) || 1)));
            }}
          />
          <span className="hint">
            maps to the graph wall&apos;s PROBED capConfig.maxNodes — caps stay probed + bannered by
            the cell, never silent; applies on the next graph (re)mount
          </span>
        </div>
      </div>
    </div>
  );
}

export function PluginsPage(p: { pieces: ComposedPiece[] }): React.ReactElement {
  return (
    <div className="settings-stack" data-testid="plugins-page">
      <div className="hint">
        the REAL composed pieces of this assembly — cells behind walls plus the two servers.
        This is an honest inventory, not a marketplace: nothing here installs, everything
        here is already load-bearing.
      </div>
      {p.pieces.map((pc) => (
        <div key={pc.name} className="plugin-row">
          <b className="mono">{pc.name}</b>
          <span className="mono plugin-ver">{pc.version ?? "(version not served)"}</span>
          <span className="hint">{pc.role}</span>
        </div>
      ))}
    </div>
  );
}
