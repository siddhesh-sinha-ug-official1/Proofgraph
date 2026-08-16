/**
 * UI-1C round — the 42px header (shell-design README §Screens/views):
 * hamburger (toggles the full menubar inline) · logo (the 3-node SVG mark —
 * accent + CANONICAL green/red verdict circles, grey edges, as drawn in the
 * mock) · project switcher (recents + Close project) · spacer · analyze
 * split-button (primary analyze + declared-roots config dropdown, accent bg)
 * · search-everywhere · settings cog (quick menu) · hub transport chip
 * reading the REAL /health (dot green only when the hub answered — the mock's
 * outage SIMULATOR is deliberately out; see agentic-convos/ui-1c-round.md).
 *
 * SUB200 restructure: this module stays the FACADE component — the popup
 * clusters live in headerMenus.tsx (project switcher / settings cog / hub
 * chip) and headerAnalyze.tsx (analyze split-button + search). The single-
 * open-popup state and outside-click/Esc close stay here. Surface unchanged.
 */

import React, { useEffect, useRef, useState } from "react";
import { COLORS } from "@graph-view/src/verdict";
import { MenuBar, type MenuSpec } from "./MenuBar";
import { probeShell } from "./shellLog";
import type { RecentEntry } from "./prefs";
import { HubChip, ProjectSwitcher, SettingsMenu } from "./headerMenus";
import { AnalyzeCluster } from "./headerAnalyze";

/** The inline 3-node logo mark — reused as drawn in the mocks. The green/red
 *  circles are PROOF SEMANTICS: imported canonical fills, never restated. */
export function LogoMark({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="logo-mark">
      <circle cx="4" cy="3.5" r="2.1" fill="var(--acc)" />
      <circle cx="12" cy="6" r="2.1" fill={COLORS.green} />
      <circle cx="6.5" cy="12.5" r="2.1" fill={COLORS.red} />
      <path d="M5.5 5L10.5 5.8M5 5.5L6.2 10.6M11 7.8L7.6 11.2" stroke="var(--txd)" strokeWidth="1.1" fill="none" />
    </svg>
  );
}

export interface HeaderProps {
  barOn: boolean;
  onToggleBar: () => void;
  menus: MenuSpec[];
  projectOpen: boolean;
  /** served /workspace facts (null = not served — the switcher says so) */
  workspacePackage: string | null;
  workspaceRoot: string | null;
  recents: RecentEntry[];
  onOpenRecent: (r: RecentEntry) => void;
  onCloseProject: () => void;
  analyzing: boolean;
  analyzeEnabled: boolean;
  analyzeReason: string;
  declaredRoots: string[];
  onAnalyze: () => void;
  onChooseRoots: () => void;
  onSearch: () => void;
  onSettings: (page?: string) => void;
  theme: "light" | "dark";
  onTheme: (t: "light" | "dark") => void;
  hubPort: string;
  hubOk: boolean;
  onHubChip: () => void;
}

type Pop = "project" | "run" | "settings" | null;

export default function Header(p: HeaderProps): React.ReactElement {
  const [pop, setPop] = useState<Pop>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pop === null) return;
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setPop(null);
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setPop(null); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pop]);

  const act = (fn: () => void) => (): void => { setPop(null); fn(); };

  return (
    <div className="header" ref={rootRef} data-testid="header">
      <button
        type="button" className="header-iconbtn" data-testid="hamburger"
        title="toggle the main menu bar" aria-expanded={p.barOn}
        onClick={() => { probeShell("shell.menubar.toggle", { on: !p.barOn }); p.onToggleBar(); }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <LogoMark />
      <ProjectSwitcher
        projectOpen={p.projectOpen}
        workspacePackage={p.workspacePackage}
        workspaceRoot={p.workspaceRoot}
        recents={p.recents}
        onOpenRecent={p.onOpenRecent}
        onCloseProject={p.onCloseProject}
        open={pop === "project"}
        onToggle={() => setPop(pop === "project" ? null : "project")}
        act={act}
      />
      {p.barOn && <MenuBar menus={p.menus} />}
      <span className="header-spacer" />
      {p.projectOpen && (
        <AnalyzeCluster
          analyzing={p.analyzing}
          analyzeEnabled={p.analyzeEnabled}
          analyzeReason={p.analyzeReason}
          declaredRoots={p.declaredRoots}
          onAnalyze={p.onAnalyze}
          onChooseRoots={p.onChooseRoots}
          onSearch={p.onSearch}
          popOpen={pop === "run"}
          onTogglePop={() => setPop(pop === "run" ? null : "run")}
          act={act}
        />
      )}
      <SettingsMenu
        theme={p.theme}
        onTheme={p.onTheme}
        onSettings={p.onSettings}
        open={pop === "settings"}
        onToggle={() => setPop(pop === "settings" ? null : "settings")}
        act={act}
      />
      <HubChip hubOk={p.hubOk} hubPort={p.hubPort} onHubChip={p.onHubChip} />
    </div>
  );
}
