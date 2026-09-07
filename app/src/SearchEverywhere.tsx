/**
 * UI-1C round — Search Everywhere: files + graph nodes in one dialog.
 *
 * Sources, both BOUNDED with the bound logged (never a silent trim):
 *  - files: a breadth-first walk over hub GET /fs/list (browser never touches
 *    the FS), capped at SEARCH_MAX_DIRS listings / SEARCH_MAX_FILES entries —
 *    walked ONCE per dialog open, then filtered client-side;
 *  - graph nodes: the byte-gated SERVED envelope's node set (name/id
 *    substring match).
 * Queries are debounced (SEARCH_DEBOUNCE_MS); every executed query is probed
 * (shell.search.query) with the hit counts and the applied bounds. A failed
 * /fs/list walk renders its NAMED class inline — files degrade, nodes stay.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fsList, type HttpDo } from "./fsSource";
import { GraphSourceError } from "./graphSource";
import { probeShell } from "./shellLog";
import { fileIcon } from "./Explorer";

export const SEARCH_MAX_DIRS = 40;
export const SEARCH_MAX_FILES = 200;
export const SEARCH_MAX_ROWS = 12;
export const SEARCH_DEBOUNCE_MS = 150;

export interface SearchNode {
  id: string;
  name: string;
}

export interface SearchHit {
  kind: "file" | "node";
  key: string;
  label: string;
  icon: string;
}

/** PURE filter over the two collected sources — bounded to SEARCH_MAX_ROWS. */
export function searchHits(files: string[], nodes: SearchNode[], query: string): { hits: SearchHit[]; truncated: boolean } {
  const q = query.trim().toLowerCase();
  const fileHits: SearchHit[] = files
    .filter((p) => q === "" || p.toLowerCase().includes(q))
    .map((p) => ({ kind: "file" as const, key: p, label: p, icon: fileIcon(p.split("/").pop() ?? p) }));
  const nodeHits: SearchHit[] = nodes
    .filter((n) => q === "" || n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
    .map((n) => ({ kind: "node" as const, key: n.id, label: n.name, icon: "◉" }));
  const all = [...fileHits, ...nodeHits];
  return { hits: all.slice(0, SEARCH_MAX_ROWS), truncated: all.length > SEARCH_MAX_ROWS };
}

export default function SearchEverywhere(props: {
  hubBase: string;
  httpDo: HttpDo;
  fsAvailable: boolean;
  nodes: SearchNode[];
  onOpenFile: (relPath: string) => void;
  onPickNode: (nodeId: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [walkFailure, setWalkFailure] = useState<{ failureClass: string; detail: string } | null>(null);
  const [walkDone, setWalkDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // one bounded BFS walk per dialog open (files source)
  useEffect(() => {
    let dead = false;
    if (!props.fsAvailable) {
      setWalkFailure({ failureClass: "workspace-not-open", detail: "hub /workspace + /fs endpoints unavailable — file search disabled; node search still serves" });
      setWalkDone(true);
      return;
    }
    (async () => {
      const found: string[] = [];
      const queue: string[] = [""];
      let dirsListed = 0;
      let bounded = false;
      try {
        while (queue.length > 0 && dirsListed < SEARCH_MAX_DIRS && found.length < SEARCH_MAX_FILES) {
          const dir = queue.shift()!;
          const entries = await fsList(props.hubBase, dir, props.httpDo);
          dirsListed++;
          if (dead) return;
          for (const e of entries) {
            const child = dir === "" ? e.name : `${dir}/${e.name}`;
            if (e.kind === "dir") queue.push(child);
            else if (found.length < SEARCH_MAX_FILES) found.push(child);
            else bounded = true;
          }
        }
        bounded = bounded || queue.length > 0;
        probeShell("shell.search.files.walk", {
          dirsListed, files: found.length, bounded,
          bounds: { maxDirs: SEARCH_MAX_DIRS, maxFiles: SEARCH_MAX_FILES },
          note: bounded ? "walk BOUNDED — deeper entries not listed (logged, never silent)" : "walk complete",
        });
        if (!dead) { setFiles(found); setWalkDone(true); }
      } catch (e) {
        if (dead) return;
        const fc = e instanceof GraphSourceError ? e.failureClass : "hub-unreachable";
        probeShell("shell.search.files.failed", { failureClass: fc });
        setWalkFailure({ failureClass: fc, detail: e instanceof Error ? e.message : String(e) });
        setWalkDone(true);
      }
    })();
    return () => { dead = true; };
  }, [props.hubBase, props.httpDo, props.fsAvailable]);

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { hits, truncated } = useMemo(() => searchHits(files, props.nodes, debounced), [files, props.nodes, debounced]);

  // probe each EXECUTED (debounced) query with counts + bounds
  useEffect(() => {
    if (!walkDone) return;
    probeShell("shell.search.query", {
      query: debounced, hits: hits.length, truncated, rowBound: SEARCH_MAX_ROWS,
      sources: { files: files.length, nodes: props.nodes.length },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, walkDone]);

  return (
    <div className="modal-backdrop search-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div
        className="search-dialog" role="dialog" aria-modal="true" aria-label="search everywhere"
        data-testid="search-everywhere"
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); props.onClose(); } }}
      >
        <div className="search-input-row">
          <input
            ref={inputRef}
            value={query}
            aria-label="search everywhere"
            placeholder="search everywhere — files and graph nodes…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {walkFailure !== null && (
          <div className="banner banner-warn"><b>{walkFailure.failureClass}</b>: {walkFailure.detail}</div>
        )}
        <div className="search-rows">
          {!walkDone && walkFailure === null && <div className="popup-hint">walking hub /fs/list (bounded)…</div>}
          {walkDone && hits.length === 0 && <div className="popup-hint">no files or graph nodes match</div>}
          {hits.map((h) => (
            <div
              key={`${h.kind}:${h.key}`}
              className="popup-row search-row"
              role="option"
              tabIndex={0}
              data-search-hit={h.key}
              onClick={() => (h.kind === "file" ? props.onOpenFile(h.key) : props.onPickNode(h.key))}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); h.kind === "file" ? props.onOpenFile(h.key) : props.onPickNode(h.key); } }}
            >
              <span className="popup-ic">{h.icon}</span>
              <span className="mono">{h.label}</span>
              <span className="popup-right">{h.kind === "file" ? "file" : "node → graph"}</span>
            </div>
          ))}
          {truncated && (
            <div className="popup-hint">row bound {SEARCH_MAX_ROWS} hit — keep typing to narrow (bound probed)</div>
          )}
        </div>
        <div className="search-foot">
          server-side browse — hub /fs/list, path-jailed · node hits select in the graph · Esc to close
        </div>
      </div>
    </div>
  );
}
