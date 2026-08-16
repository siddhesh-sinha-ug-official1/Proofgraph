/**
 * SUB200 restructure (wave 2) — the shared shell-suite reset + probe reader,
 * hoisted VERBATIM from shell.units / shell.face / shell1c.* (they all carried
 * the identical beforeEach body and `probes` filter).
 *
 * Usage in a test file:  beforeEach(resetShellState);
 */

import { __resetShellLogForTests, shellLogHistory } from "../../src/shellLog";

export function resetShellState(): void {
  localStorage.clear();
  __resetShellLogForTests();
}

export const probes = (id: string) => shellLogHistory().filter((e) => e.probeId === id);
