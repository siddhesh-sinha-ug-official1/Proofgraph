/**
 * App-shell round — the bottom dock: three tabs. UI-1C: the tabbed dock is no
 * longer mounted by App (the three panels became independent tool windows —
 * DiagnosticsList + PinsConsole are exported and reused VERBATIM as window
 * content; AiPanel mounts directly). BottomDock itself is kept exported so a
 * rollback still composes.
 *   AI outlet     — the EXISTING AiPanel, reused verbatim (keys stay in the
 *                   ai-server process; FAKE transport labels itself);
 *   diagnostics   — the LSP publishDiagnostics stream, read from the editor
 *                   wall's OWN pins (editor.lsp.in.diagnostics — the cell's
 *                   probe, tapped, never re-derived). Tier G stub = an honest
 *                   empty list that says why;
 *   pins console  — filterable tail of the hub's /pins/history AGGREGATE plus
 *                   the app's own shell log (window.pgShellLog) — the
 *                   contract's "tail visible in the pins console".
 */

import React, { useEffect, useMemo, useState } from "react";
import AiPanel from "./AiPanel";
import { fetchPinsHistory, type HttpDo } from "./fsSource";
import { GraphSourceError } from "./graphSource";
import { shellLogHistory, tapShellLog, type ShellLogEntry } from "./shellLog";
import type { BottomTab } from "./layout";

export interface DiagnosticRow {
  uri: string;
  version: number | null;
  severity: number | null;
  message: string;
  line: number | null;
  source: string | null;
}

export function BottomDock(props: {
  tab: BottomTab;
  onTab: (t: BottomTab) => void;
  aiBase: string;
  hubBase: string;
  httpDo: HttpDo;
  diagnostics: DiagnosticRow[];
  diagnosticsNote: string;
}): React.ReactElement {
  const tabs: Array<{ id: BottomTab; label: string }> = [
    { id: "ai", label: "AI outlet" },
    { id: "diagnostics", label: `Diagnostics (${props.diagnostics.length})` },
    { id: "pins", label: "Pins console" },
  ];
  return (
    <div className="bottom-dock" data-testid="bottom-dock">
      <div className="dock-tabs" role="tablist" aria-label="bottom dock panels">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={props.tab === t.id}
            className={`dock-tab ${props.tab === t.id ? "dock-tab-active" : ""}`}
            onClick={() => props.onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="dock-body" role="tabpanel">
        {props.tab === "ai" && <AiPanel aiBase={props.aiBase} />}
        {props.tab === "diagnostics" && (
          <DiagnosticsList rows={props.diagnostics} note={props.diagnosticsNote} />
        )}
        {props.tab === "pins" && <PinsConsole hubBase={props.hubBase} httpDo={props.httpDo} />}
      </div>
    </div>
  );
}

export function DiagnosticsList({ rows, note }: { rows: DiagnosticRow[]; note: string }): React.ReactElement {
  const sevName = (s: number | null): string =>
    s === 1 ? "error" : s === 2 ? "warning" : s === 3 ? "info" : s === 4 ? "hint" : "?";
  return (
    <div className="diag-list" data-testid="diagnostics-list">
      <div className="hint">{note}</div>
      {rows.length === 0 && <div className="explorer-note">no diagnostics received</div>}
      {rows.map((d, i) => (
        <div key={i} className={`diag-row diag-${sevName(d.severity)}`}>
          <b>{sevName(d.severity)}</b>
          {d.line !== null && <span> L{d.line}</span>}
          {" — "}{d.message}
          <span className="hint"> {d.source ?? ""} · {d.uri.split("/").pop()}{d.version !== null ? ` v${d.version}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

// ── pins console ─────────────────────────────────────────────────────────────

interface ConsoleLine {
  stream: string;
  probeId: string;
  payload: unknown;
}

const PINS_TAIL = 120;

export function PinsConsole({ hubBase, httpDo }: { hubBase: string; httpDo: HttpDo }): React.ReactElement {
  const [filter, setFilter] = useState("");
  const [hubLines, setHubLines] = useState<ConsoleLine[] | null>(null);
  const [failure, setFailure] = useState<{ failureClass: string; detail: string } | null>(null);
  const [shellTail, setShellTail] = useState<readonly ShellLogEntry[]>(() => [...shellLogHistory()]);
  const [refreshTick, setRefreshTick] = useState(0);

  // live tail of the app's own probe log
  useEffect(() => tapShellLog(() => setShellTail([...shellLogHistory()])), []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const body = await fetchPinsHistory(hubBase, PINS_TAIL, httpDo);
        if (dead) return;
        const lines: ConsoleLine[] = [];
        const takeEvents = (stream: string, section: unknown): void => {
          const events = (section as { events?: unknown })?.events;
          if (!Array.isArray(events)) return;
          for (const e of events) {
            const row = e as Record<string, unknown>;
            lines.push({ stream, probeId: String(row.probeId ?? row.event ?? "?"), payload: row.payload ?? row });
          }
        };
        takeEvents("hub", body.hub);
        const cells = (body.cells ?? {}) as Record<string, unknown>;
        for (const [name, section] of Object.entries(cells)) takeEvents(name, section);
        setHubLines(lines);
        setFailure(null);
      } catch (e) {
        if (dead) return;
        setHubLines(null);
        setFailure({
          failureClass: e instanceof GraphSourceError ? e.failureClass : "hub-unreachable",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => { dead = true; };
  }, [hubBase, httpDo, refreshTick]);

  const all = useMemo(() => {
    const shell: ConsoleLine[] = shellTail.map((e) => ({ stream: "app-shell", probeId: e.probeId, payload: e.payload }));
    const merged = [...(hubLines ?? []), ...shell];
    const f = filter.trim().toLowerCase();
    const filtered = f === ""
      ? merged
      : merged.filter((l) =>
          l.probeId.toLowerCase().includes(f) ||
          l.stream.toLowerCase().includes(f) ||
          JSON.stringify(l.payload).toLowerCase().includes(f));
    return filtered.slice(-PINS_TAIL); // tail-bounded, bound visible below
  }, [hubLines, shellTail, filter]);

  return (
    <div className="pins-console" data-testid="pins-console">
      <div className="pins-toolbar">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter probes (id / stream / payload substring)…"
          aria-label="filter pins"
        />
        <button type="button" onClick={() => setRefreshTick((t) => t + 1)}>refresh hub pins</button>
        <span className="hint">tail bound {PINS_TAIL}/stream (hub side flags its own truncation; app log bound is probed)</span>
      </div>
      {failure !== null && (
        <div className="banner banner-warn">
          <b>{failure.failureClass}</b>: hub pins unavailable — showing the app-shell log only. {failure.detail}
        </div>
      )}
      <div className="pins-lines">
        {all.length === 0 && <div className="explorer-note">no probe entries match</div>}
        {all.map((l, i) => (
          <div key={i} className="pins-line">
            <span className={`pins-stream pins-stream-${l.stream === "app-shell" ? "app" : "hub"}`}>{l.stream}</span>
            <b>{l.probeId}</b>
            <span className="pins-payload">{JSON.stringify(l.payload)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
