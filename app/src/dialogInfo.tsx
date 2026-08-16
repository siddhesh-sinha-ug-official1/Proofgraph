/**
 * Preferences / About / Gap-report dialogs (SUB200 split of dialogs.tsx — no
 * behavior change): every pref change routes through setPref (persisted +
 * probed); About carries the schema PIN + wall versions + MEASURED tier
 * verbatim + licenses + the contract's out-of-scope list VERBATIM; the gap
 * report renders SERVED /analysis gapAnalysis only. dialogs.tsx is the facade.
 */

import React from "react";
import { Modal } from "./dialogModal";
import {
  FONT_SIZE_MAX, FONT_SIZE_MIN, type Prefs, setPref,
} from "./prefs";

// ── preferences ──────────────────────────────────────────────────────────────

export function PreferencesDialog(props: {
  prefs: Prefs;
  onPrefs: (next: Prefs) => void;
  onClose: () => void;
}): React.ReactElement {
  const { prefs } = props;
  const change = <K extends keyof Prefs>(key: K, value: Prefs[K]): void => {
    props.onPrefs(setPref(prefs, key, value)); // setPref persists + probes
  };
  return (
    <Modal title="Preferences" onClose={props.onClose} testId="prefs-dialog">
      <div className="pref-row">
        <span>Theme</span>
        <label><input type="radio" name="theme" checked={prefs.theme === "light"} onChange={() => change("theme", "light")} /> light</label>
        <label><input type="radio" name="theme" checked={prefs.theme === "dark"} onChange={() => change("theme", "dark")} /> dark</label>
        <span className="hint">default follows prefers-color-scheme; Monaco keeps the cell&apos;s own darcula theme (cell-owned)</span>
      </div>
      <div className="pref-row">
        <span>Editor font size</span>
        <input
          type="number"
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          value={prefs.editorFontSize}
          aria-label="editor font size"
          onChange={(e) => {
            const v = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(Number(e.target.value) || 0)));
            change("editorFontSize", v);
          }}
        />
        <span className="hint">px · bounds {FONT_SIZE_MIN}–{FONT_SIZE_MAX} (clamped, clamp persisted)</span>
      </div>
      <div className="pref-row">
        <span>Graph node cap</span>
        <input
          type="number"
          min={1}
          placeholder="cell default (1500)"
          value={prefs.graphMaxNodes ?? ""}
          aria-label="graph node cap"
          onChange={(e) => {
            const raw = e.target.value.trim();
            change("graphMaxNodes", raw === "" ? null : Math.max(1, Math.round(Number(raw) || 1)));
          }}
        />
        <span className="hint">maps to the graph wall&apos;s PROBED capConfig.maxNodes — caps stay probed + bannered by the cell, never silent; applies on the next graph (re)mount</span>
      </div>
      <div className="pref-row">
        <label>
          <input
            type="checkbox"
            checked={prefs.autoReanalyzeOnSave}
            onChange={(e) => change("autoReanalyzeOnSave", e.target.checked)}
          /> auto re-analyze on save (POST /analyze after every successful PUT /fs/file)
        </label>
      </div>
      <div className="dialog-actions">
        <button type="button" className="primary" onClick={props.onClose}>done</button>
      </div>
    </Modal>
  );
}

// ── about ────────────────────────────────────────────────────────────────────

/** The contract's out-of-scope list — VERBATIM (Help &gt; About must say so). */
export const OUT_OF_SCOPE_VERBATIM =
  "Command palette, multi-workspace, VCS integration, live AI transport UI, plugin system.";

export function AboutDialog(props: {
  schemaPin: { schemaVersion: string; schemaHash: string } | null;
  wallVersions: Record<string, string | null>;
  measuredTier: string | null;
  transport: string | null;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Modal title="About ProofGraph" onClose={props.onClose} testId="about-dialog">
      <div className="about-grid">
        <b>Schema PIN</b>
        <span>
          {props.schemaPin !== null
            ? <code>{props.schemaPin.schemaVersion} / {props.schemaPin.schemaHash}</code>
            : <span className="hint">hub /health not reachable — pin not served (nothing is claimed)</span>}
        </span>
        <b>Wall versions</b>
        <span>
          {Object.entries(props.wallVersions).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join(" · ") || <span className="hint">(none served)</span>}
        </span>
        <b>Measured tier</b>
        <span>
          {props.measuredTier !== null
            ? <span><code>{props.measuredTier}</code> <span className="hint">(read VERBATIM from the hub-aggregated capability.wall.construct pin — measured, never asserted)</span></span>
            : <span className="hint">no measured capability stream — the editor stands on the stub floor at tier G, no live diagnostics claimed</span>}
          {props.transport !== null && <span className="hint"> · transport: {props.transport}</span>}
        </span>
        <b>Licenses</b>
        <span>
          monaco-editor (MIT) · @xyflow/react (MIT) · react (MIT) ·{" "}
          <b>elkjs (EPL-2.0 — logged dependency note: the layout engine is Eclipse-licensed; noted here per the assembly log)</b>{" "}
          · @dagrejs/dagre (MIT) · @fontsource/jetbrains-mono (OFL-1.1)
        </span>
        <b>Docs</b>
        <span>
          copyable paths (not file:// links): <code>proofgraph/README.md</code> · <code>proofgraph/app/README.md</code> ·{" "}
          <code>proofgraph/APP-SHELL-CONTRACT.md</code> · <code>proofgraph/ARCHITECTURE-PHASE2.md</code>
        </span>
        <b>Out of scope this round</b>
        <span data-testid="out-of-scope">{OUT_OF_SCOPE_VERBATIM}</span>
      </div>
      <div className="dialog-actions">
        <button type="button" className="primary" onClick={props.onClose}>close</button>
      </div>
    </Modal>
  );
}

// ── gap report (rendered from /analysis gapAnalysis — served data only) ──────
// [Wave-B D5] blindSpots served as [{source, blindSpots?:string[], payload?:obj}];
// pre-D5 .map(String)'d it and rendered "[object Object]".
function BlindSpotSource(props: { entry: unknown; index: number }): React.ReactElement {
  const e = (props.entry ?? {}) as Record<string, unknown>;
  const source = typeof e.source === "string" ? e.source : `entry ${props.index}`;
  const spots = Array.isArray(e.blindSpots) ? (e.blindSpots as unknown[]).map(String) : null;
  const payload = e.payload && typeof e.payload === "object" ? e.payload as Record<string, unknown> : null;
  const fmt = (v: unknown): string => Array.isArray(v) ? (v as unknown[]).map(String).join(", ")
    : (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));
  return (
    <div className="gap-blindspot-source" data-testid={`blindspot-source-${props.index}`}>
      <div><i>source:</i> <code>{source}</code></div>
      {spots !== null && (
        <ul className="gap-blindspot-list">{spots.map((s, i) => <li key={i}>{s}</li>)}</ul>
      )}
      {payload !== null && (
        <dl className="gap-blindspot-payload">
          {Object.entries(payload).flatMap(([k, v]) => [
            <dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{fmt(v)}</dd>])}
        </dl>
      )}
      {spots === null && payload === null && (
        <div className="hint">(no blindSpots/payload — raw: {JSON.stringify(e)})</div>
      )}
    </div>
  );
}

export function GapReportDialog(props: {
  gapAnalysis: Record<string, unknown>;
  onClose: () => void;
}): React.ReactElement {
  const g = props.gapAnalysis;
  const list = (key: string): string[] => Array.isArray(g[key]) ? (g[key] as unknown[]).map(String) : [];
  const blindEntries: unknown[] = Array.isArray(g.blindSpots) ? (g.blindSpots as unknown[]) : [];
  return (
    <Modal title="Gap report (from GET /analysis gapAnalysis — served, never recomputed here)" onClose={props.onClose} testId="gap-report-dialog">
      <div className="gap-section"><b>unused</b> ({list("unused").length}): {list("unused").join(", ") || "(none)"}</div>
      <div className="gap-section"><b>unreferenced</b> ({list("unreferenced").length}): {list("unreferenced").join(", ") || "(none)"}</div>
      <div className="gap-section" data-testid="blindspots-section">
        <b>blind spots</b> ({blindEntries.length}):{" "}
        {blindEntries.length === 0
          ? "(none)"
          : <div className="gap-blindspot-sources">
              {blindEntries.map((entry, i) => (
                <BlindSpotSource key={i} entry={entry} index={i} />
              ))}
            </div>}
      </div>
      <div className="gap-section">
        <b>incomplete bases</b>: {Object.keys((g.incompleteBases ?? {}) as Record<string, unknown>).join(", ") || "(none)"}
      </div>
      <div className="gap-section"><b>soundness note</b>: {String(g.soundnessNote ?? "(none served)")}</div>
      <details>
        <summary>raw gapAnalysis (served bytes, pretty-printed)</summary>
        <pre className="gap-raw">{JSON.stringify(g, null, 2)}</pre>
      </details>
      <div className="dialog-actions">
        <button type="button" className="primary" onClick={props.onClose}>close</button>
      </div>
    </Modal>
  );
}
