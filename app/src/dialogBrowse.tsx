/**
 * Server-side browse dialogs (SUB200 split of dialogs.tsx — no behavior
 * change): Open folder… / Open file… over hub /fs/list (the browser never
 * touches the filesystem) + Choose declared roots… over /fs/roots-candidates
 * (roots stay DECLARED, NEVER inferred). dialogs.tsx stays the facade.
 */

import React, { useEffect, useState } from "react";
import { fsList, fetchRootsCandidates, type FsEntry, type HttpDo, type RootCandidate } from "./fsSource";
import { GraphSourceError } from "./graphSource";
import { probeShell } from "./shellLog";
import { Modal } from "./dialogModal";

// ── server-side path browser (Open folder… / Open file…) ─────────────────────

export function OpenPathDialog(props: {
  mode: "folder" | "file";
  hubBase: string;
  httpDo: HttpDo;
  onPick: (relPath: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [failure, setFailure] = useState<{ failureClass: string; detail: string } | null>(null);

  useEffect(() => {
    let dead = false;
    setEntries(null);
    setFailure(null);
    (async () => {
      try {
        const rows = await fsList(props.hubBase, cwd, props.httpDo);
        if (!dead) setEntries(rows);
      } catch (e) {
        if (dead) return;
        setFailure({
          failureClass: e instanceof GraphSourceError ? e.failureClass : "hub-unreachable",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => { dead = true; };
  }, [cwd, props.hubBase, props.httpDo]);

  const join = (name: string): string => (cwd === "" ? name : `${cwd}/${name}`);
  const up = (): void => setCwd(cwd.includes("/") ? cwd.slice(0, cwd.lastIndexOf("/")) : "");

  return (
    <Modal title={props.mode === "folder" ? "Open folder (workspace-jailed, server-side browse)" : "Open file (workspace-jailed, server-side browse)"} onClose={props.onClose} testId="open-path-dialog">
      <div className="hint">
        browsing the hub&apos;s /fs/list — path-jailed to the workspace root; traversal outside is the hub&apos;s named refusal <code>path-escape</code>
      </div>
      <div className="dialog-path-row">
        <button type="button" onClick={up} disabled={cwd === ""} title={cwd === "" ? "already at the workspace root (the jail)" : "up one directory"}>↑ up</button>
        <code>/{cwd}</code>
        {props.mode === "folder" && (
          <button type="button" className="primary" onClick={() => { props.onPick(cwd); }}>
            open this folder
          </button>
        )}
      </div>
      {failure !== null && <div className="banner banner-error"><b>{failure.failureClass}</b>: {failure.detail}</div>}
      {entries === null && failure === null && <div className="explorer-note">loading…</div>}
      {entries !== null && (
        <div className="dialog-list" role="listbox" aria-label="directory entries">
          {entries.length === 0 && <div className="explorer-note">(empty directory)</div>}
          {[...entries].sort((a, b) => a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name)).map((e) => (
            <div
              key={e.name}
              role="option"
              aria-selected={false}
              tabIndex={0}
              className="dialog-list-row"
              onClick={() => {
                if (e.kind === "dir") setCwd(join(e.name));
                else if (props.mode === "file") props.onPick(join(e.name));
              }}
              onKeyDown={(ev) => {
                if (ev.key !== "Enter") return;
                if (e.kind === "dir") setCwd(join(e.name));
                else if (props.mode === "file") props.onPick(join(e.name));
              }}
            >
              {e.kind === "dir" ? "📁" : "·"} {e.name}
              {e.kind === "file" && e.size !== null && <span className="hint"> {e.size} B</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── root picker (declared roots — NEVER inferred) ────────────────────────────

export function RootPickerDialog(props: {
  hubBase: string;
  httpDo: HttpDo;
  currentDeclaredRoots: string[];
  onApply: (rootIds: string[]) => void;
  onClose: () => void;
}): React.ReactElement {
  const [candidates, setCandidates] = useState<RootCandidate[] | null>(null);
  const [failure, setFailure] = useState<{ failureClass: string; detail: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(props.currentDeclaredRoots));

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const rows = await fetchRootsCandidates(props.hubBase, props.httpDo);
        if (!dead) setCandidates(rows);
      } catch (e) {
        if (dead) return;
        setFailure({
          failureClass: e instanceof GraphSourceError ? e.failureClass : "hub-unreachable",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => { dead = true; };
  }, [props.hubBase, props.httpDo]);

  return (
    <Modal title="Choose declared roots (never inferred)" onClose={props.onClose} testId="root-picker-dialog">
      <div className="hint">
        roots are DECLARED by you and passed to the next /analyze run — the pipeline never guesses them.
        currently declared: {props.currentDeclaredRoots.length > 0 ? props.currentDeclaredRoots.join(", ") : "(none)"}
      </div>
      {failure !== null && <div className="banner banner-error"><b>{failure.failureClass}</b>: {failure.detail}</div>}
      {candidates === null && failure === null && <div className="explorer-note">loading /fs/roots-candidates…</div>}
      {candidates !== null && (
        <div className="dialog-list" role="listbox" aria-multiselectable="true" aria-label="root candidates">
          {candidates.length === 0 && <div className="explorer-note">(no eligible decl nodes served)</div>}
          {candidates.map((c) => (
            <label key={c.id} className="dialog-list-row dialog-check-row">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(c.id); else next.delete(c.id);
                    return next;
                  });
                }}
              />
              <span>{c.name} <span className="hint">({c.kind} · {c.id})</span></span>
            </label>
          ))}
        </div>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="primary"
          disabled={candidates === null}
          title={candidates === null ? "candidates not loaded — nothing to declare" : "re-run /analyze with exactly these declared roots"}
          onClick={() => {
            const roots = [...selected];
            probeShell("shell.roots.declared", { roots, note: "user-declared via root picker — NEVER inferred" });
            props.onApply(roots);
          }}
        >
          declare {selected.size} root{selected.size === 1 ? "" : "s"} + re-analyze
        </button>
        <button type="button" onClick={props.onClose}>cancel</button>
      </div>
    </Modal>
  );
}
