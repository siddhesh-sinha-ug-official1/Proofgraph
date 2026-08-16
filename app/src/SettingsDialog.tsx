/**
 * UI-1C round — the paged Settings dialog (shell-design README §Dialogs):
 *  - Appearance: theme cards + FREE accent picker (color input + hex field +
 *    4 swatches). The accent drives --acc ONLY — verdict fills are proof
 *    semantics and stay canonical (said on the page, enforced by import).
 *  - Editor · Font: stepper 10–18px (bounds shared with prefs.ts, clamped).
 *  - Analysis: pyright live/none · auto-reanalyze-on-save · graph node cap.
 *  - Plugins: an HONEST static list of the REAL composed pieces (cells/walls
 *    + servers) — not a fake marketplace (adaptation logged in the round file).
 * Every change routes through setPref (persisted + probed, versioned key).
 *
 * SUB200 restructure: this module stays the FACADE component — the pages
 * live in settingsAppearance.tsx + settingsPanels.tsx; the nav, page state
 * and accent-draft state stay here. Public surface unchanged.
 */

import React, { useState } from "react";
import { Modal } from "./dialogs";
import {
  FONT_SIZE_MAX, FONT_SIZE_MIN, isAccentHex, setPref, type Prefs,
} from "./prefs";
import { AppearancePage } from "./settingsAppearance";
import { AnalysisPage, EditorFontPage, PluginsPage, type ComposedPiece } from "./settingsPanels";

export type SettingsPage = "appearance" | "editor" | "analysis" | "plugins";
export type { ComposedPiece } from "./settingsPanels";

export default function SettingsDialog(props: {
  prefs: Prefs;
  onPrefs: (next: Prefs) => void;
  onClose: () => void;
  initialPage?: SettingsPage;
  /** the REAL composed pieces (hub /health wallVersions + the app's own wall pins) */
  pieces: ComposedPiece[];
}): React.ReactElement {
  const [page, setPage] = useState<SettingsPage>(props.initialPage ?? "appearance");
  const [accentDraft, setAccentDraft] = useState<string | null>(null);
  const { prefs } = props;
  const change = <K extends keyof Prefs>(key: K, value: Prefs[K]): void => {
    props.onPrefs(setPref(prefs, key, value)); // persists + probes
  };

  const nav: Array<{ id: SettingsPage; label: string }> = [
    { id: "appearance", label: "Appearance" },
    { id: "editor", label: "Editor · Font" },
    { id: "analysis", label: "Analysis" },
    { id: "plugins", label: "Plugins" },
  ];

  const setAccent = (raw: string): void => {
    let v = raw.trim();
    if (v !== "" && v[0] !== "#") v = `#${v}`;
    if (isAccentHex(v)) {
      change("accentColor", v);
      setAccentDraft(null);
    } else {
      setAccentDraft(raw);
    }
  };

  const fontStep = (d: number): void => {
    change("editorFontSize", Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prefs.editorFontSize + d)));
  };

  return (
    <Modal title="Settings" onClose={props.onClose} testId="prefs-dialog">
      <div className="settings-body">
        <div className="settings-nav" role="tablist" aria-label="settings pages">
          {nav.map((n) => (
            <div
              key={n.id} role="tab" aria-selected={page === n.id}
              data-settings-page={n.id}
              className={`settings-nav-row ${page === n.id ? "settings-nav-active" : ""}`}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </div>
          ))}
        </div>
        <div className="settings-page" role="tabpanel">
          {page === "appearance" && (
            <AppearancePage
              prefs={prefs} change={change}
              accentDraft={accentDraft} setAccent={setAccent}
              clearDraft={() => setAccentDraft(null)}
            />
          )}
          {page === "editor" && <EditorFontPage prefs={prefs} change={change} fontStep={fontStep} />}
          {page === "analysis" && <AnalysisPage prefs={prefs} change={change} />}
          {page === "plugins" && <PluginsPage pieces={props.pieces} />}
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="primary" onClick={props.onClose}>done</button>
      </div>
    </Modal>
  );
}
