/**
 * App-shell round — the left explorer: the hub's /fs/list tree (browser never
 * touches the filesystem — every listing is a hub endpoint, path-jailed hub
 * side). Directories load LAZILY (one /fs/list per first expand, probed);
 * files carry an icon by extension and a dirty dot when their open tab has
 * unsaved changes. A failed listing renders the NAMED failure class in the
 * pane — never a blank tree.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fsList, type FsEntry, type HttpDo } from "./fsSource";
import { GraphSourceError } from "./graphSource";
import { probeShell } from "./shellLog";

export function fileIcon(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  switch (ext) {
    case "py": return "🐍";
    case "ts": case "tsx": return "🟦";
    case "js": case "mjs": case "cjs": case "jsx": return "🟨";
    case "json": return "{}";
    case "md": return "📄";
    case "toml": case "cfg": case "ini": case "yaml": case "yml": return "⚙";
    case "lean": return "∀";
    default: return "·";
  }
}

interface DirNode {
  state: "unloaded" | "loading" | "loaded" | "failed";
  entries: FsEntry[];
  failureClass?: string;
  detail?: string;
}

export interface ExplorerProps {
  hubBase: string;
  httpDo: HttpDo;
  /** workspace known (hub /workspace answered)? null = fs endpoints unavailable */
  workspaceRoot: string | null;
  workspaceFailure: { failureClass: string; detail: string } | null;
  dirtyPaths: ReadonlySet<string>;
  openPaths: ReadonlySet<string>;
  activePath: string | null;
  onOpenFile: (relPath: string) => void;
  /** bumped by the shell after re-analyze / save to force a tree refresh */
  refreshToken: number;
}

export default function Explorer(props: ExplorerProps): React.ReactElement {
  const { hubBase, httpDo, onOpenFile } = props;
  const [dirs, setDirs] = useState<Map<string, DirNode>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const treeRef = useRef<HTMLDivElement>(null);

  const loadDir = useCallback(async (relPath: string): Promise<void> => {
    setDirs((prev) => {
      const next = new Map(prev);
      next.set(relPath, { state: "loading", entries: [] });
      return next;
    });
    try {
      const entries = await fsList(hubBase, relPath, httpDo);
      probeShell("shell.explorer.list", { path: relPath, entries: entries.length, lazy: true });
      setDirs((prev) => {
        const next = new Map(prev);
        next.set(relPath, { state: "loaded", entries });
        return next;
      });
    } catch (e) {
      const fc = e instanceof GraphSourceError ? e.failureClass : "hub-unreachable";
      const detail = e instanceof Error ? e.message : String(e);
      probeShell("shell.explorer.list.failed", { path: relPath, failureClass: fc });
      setDirs((prev) => {
        const next = new Map(prev);
        next.set(relPath, { state: "failed", entries: [], failureClass: fc, detail });
        return next;
      });
    }
  }, [hubBase, httpDo]);

  // Root listing (and full reload on refreshToken bump — post-analyze/save).
  useEffect(() => {
    if (props.workspaceRoot === null) return;
    setDirs(new Map());
    void loadDir("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workspaceRoot, props.refreshToken, loadDir]);

  const toggleDir = (relPath: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else {
        next.add(relPath);
        if (dirs.get(relPath) === undefined) void loadDir(relPath); // LAZY: first expand fetches
      }
      return next;
    });
  };

  const renderDir = (relPath: string, depth: number): React.ReactNode => {
    const node = dirs.get(relPath);
    if (node === undefined || node.state === "loading") {
      return <div className="explorer-note" style={{ paddingLeft: 12 + depth * 14 }}>loading…</div>;
    }
    if (node.state === "failed") {
      return (
        <div className="explorer-note banner-error-text" style={{ paddingLeft: 12 + depth * 14 }}>
          <b>{node.failureClass}</b>: {node.detail}
        </div>
      );
    }
    const sorted = [...node.entries].sort((a, b) =>
      a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name));
    return sorted.map((e) => {
      const childPath = relPath === "" ? e.name : `${relPath}/${e.name}`;
      if (e.kind === "dir") {
        const isOpen = expanded.has(childPath);
        return (
          <React.Fragment key={childPath}>
            <div
              className="explorer-row explorer-dir"
              role="treeitem"
              aria-expanded={isOpen}
              tabIndex={0}
              style={{ paddingLeft: 6 + depth * 14 }}
              onClick={() => toggleDir(childPath)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleDir(childPath); } }}
            >
              <span className="explorer-twist">{isOpen ? "▾" : "▸"}</span>
              <span className="explorer-icon">📁</span> {e.name}
            </div>
            {isOpen && renderDir(childPath, depth + 1)}
          </React.Fragment>
        );
      }
      const dirty = props.dirtyPaths.has(childPath);
      const opened = props.openPaths.has(childPath);
      return (
        <div
          key={childPath}
          className={`explorer-row explorer-file ${props.activePath === childPath ? "explorer-active" : ""}`}
          role="treeitem"
          aria-selected={props.activePath === childPath}
          tabIndex={0}
          data-path={childPath}
          style={{ paddingLeft: 20 + depth * 14 }}
          onClick={() => onOpenFile(childPath)}
          onKeyDown={(ev) => { if (ev.key === "Enter") onOpenFile(childPath); }}
        >
          <span className="explorer-icon">{fileIcon(e.name)}</span> {e.name}
          {opened && !dirty && <span className="hint"> ·</span>}
          {dirty && <span className="dirty-dot" title="unsaved changes">●</span>}
        </div>
      );
    });
  };

  return (
    <div className="explorer" role="tree" aria-label="workspace files" ref={treeRef} tabIndex={-1} data-testid="explorer">
      <div className="dock-title">EXPLORER {props.workspaceRoot !== null && <span className="hint">{props.workspaceRoot}</span>}</div>
      {props.workspaceRoot === null ? (
        <div className="explorer-note">
          {props.workspaceFailure === null
            ? "probing hub /workspace…"
            : <span><b>{props.workspaceFailure.failureClass}</b>: {props.workspaceFailure.detail}</span>}
        </div>
      ) : renderDir("", 0)}
    </div>
  );
}
