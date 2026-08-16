/**
 * App-shell round — the shell's OWN probe log (assembly components are fully
 * probed; APP-SHELL-CONTRACT: "every pref change + menu action logged on an
 * app-side probe log (window.pgShellLog, tail visible in the pins console)").
 *
 * Append-only, monotonic seq, tail-BOUNDED (bound logged as its own entry the
 * first time it trims — never a silent drop). Exposed as window.pgShellLog
 * (spike surface, §7.8 discipline — same move as pgEditorWall/pgGraphWall).
 */

export interface ShellLogEntry {
  seq: number;
  t: number; // Date.now()
  probeId: string;
  payload: Record<string, unknown>;
}

/** Tail bound for the in-memory log. Trimming is itself probed. */
export const SHELL_LOG_BOUND = 2000;

const entries: ShellLogEntry[] = [];
let seq = 0;
let trimNoticed = false;
const taps: Array<(e: ShellLogEntry) => void> = [];

export function probeShell(probeId: string, payload: Record<string, unknown> = {}): ShellLogEntry {
  const entry: ShellLogEntry = { seq: ++seq, t: Date.now(), probeId, payload };
  entries.push(entry);
  if (entries.length > SHELL_LOG_BOUND) {
    entries.splice(0, entries.length - SHELL_LOG_BOUND);
    if (!trimNoticed) {
      trimNoticed = true;
      entries.push({
        seq: ++seq, t: Date.now(), probeId: "shell.log.trimmed",
        payload: { bound: SHELL_LOG_BOUND, boundKind: "tail", note: "older entries dropped; bound logged once, never silent" },
      });
    }
  }
  for (const tap of [...taps]) tap(entry);
  return entry;
}

export function shellLogHistory(): readonly ShellLogEntry[] {
  return entries;
}

export function tapShellLog(fn: (e: ShellLogEntry) => void): () => void {
  taps.push(fn);
  return () => {
    const i = taps.indexOf(fn);
    if (i >= 0) taps.splice(i, 1);
  };
}

/** TEST SEAM ONLY: reset between cases so probe assertions are hermetic. */
export function __resetShellLogForTests(): void {
  entries.splice(0);
  seq = 0;
  trimNoticed = false;
  taps.splice(0);
}

// Spike surface (window may be absent under pure-node unit tests).
if (typeof window !== "undefined") {
  (window as unknown as { pgShellLog: { history: typeof shellLogHistory; tap: typeof tapShellLog; bound: number } }).pgShellLog = {
    history: shellLogHistory,
    tap: tapShellLog,
    bound: SHELL_LOG_BOUND,
  };
}
