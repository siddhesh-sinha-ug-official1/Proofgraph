// ============================================================================
// V6 outlet — the pin stream + the key-leak scrub chokepoint.
// Split out of ai/service.ts (SUB200 restructure). Behavior unchanged.
//
// SECURITY: every emit() passes through scrub(); any active secret found in a
// payload is redacted AND pinned loudly (`outlet.keyLeak.redacted`, failure
// class key-leak) — the redaction is never silent. Active secrets are set for
// the duration of one ask() run only.
// ============================================================================

import type { OutletProbeEvent } from "./types.ts";

export interface OutletPinStream {
  emit(probeId: string, payload: unknown): void;
  scrub(value: unknown, site: string): unknown;
  /** set for the duration of one ask() run; cleared in its finally block */
  setActiveSecrets(secrets: string[]): void;
  history(): OutletProbeEvent[];
}

export function createOutletPinStream(): OutletPinStream {
  const events: OutletProbeEvent[] = [];
  let seq = 0;
  let activeSecrets: string[] = []; // set for the duration of one ask() run

  function scrub(value: unknown, site: string): unknown {
    if (activeSecrets.length === 0) return value;
    let text: string;
    try { text = JSON.stringify(value) ?? ""; } catch { text = String(value); }
    let occurrences = 0;
    for (const s of activeSecrets) {
      if (s && text.includes(s)) {
        occurrences += text.split(s).length - 1;
        text = text.split(s).join(`[REDACTED-BY-OUTLET:last4=${s.slice(-4)}]`);
      }
    }
    if (occurrences === 0) return value;
    // loud, never silent: the redaction itself is pinned (failure class key-leak)
    events.push({
      seq: seq++, probeId: "outlet.keyLeak.redacted",
      payload: { failureClass: "key-leak", at: site, occurrences },
    });
    try { return JSON.parse(text); } catch { return text; }
  }

  function emit(probeId: string, payload: unknown): void {
    events.push({ seq: seq++, probeId, payload: scrub(payload, probeId) });
  }

  return {
    emit,
    scrub,
    setActiveSecrets: (secrets) => { activeSecrets = secrets; },
    history: () => events.map((e) => ({ ...e })),
  };
}
