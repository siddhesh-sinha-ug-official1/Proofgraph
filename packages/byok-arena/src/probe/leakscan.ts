// ============================================================================
// Secret-leak scan (§6.J) — the one redaction, PROVEN. Walks the ENTIRE probe
// history, all log lines, and all captured error objects and asserts the raw
// key plaintext appears nowhere. Also scans every outbound URL for keys and
// for the `?key=` pattern (the Gemini query-param trap). Build-stopping when
// rawKeyFound is ever true.
// ============================================================================

import type { ProbeBus, ProbeEvent } from "./bus.ts";
import { _secretsForScan } from "./redact.ts";

export interface LeakSite {
  where: "probe" | "log" | "error";
  probeId?: string;
  logicalClock?: number;
  index?: number;
  secretLast4: string;
}

export interface LeakScanReport {
  scannedEvents: number;
  scannedLogs: number;
  scannedErrors: number;
  secretsSearched: number;
  rawKeyFound: boolean;
  leakSites: LeakSite[];
  keyInUrl: boolean;
  urlLeakSites: LeakSite[];
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

export function runSecretLeakScan(bus: ProbeBus): LeakScanReport {
  const secrets = _secretsForScan();
  const events = bus.history();
  const logs = bus.getLogs();
  const errors = bus.getErrors();

  const leakSites: LeakSite[] = [];
  const urlLeakSites: LeakSite[] = [];
  let keyInUrlPattern = false;

  for (const ev of events) {
    // Never scan the leak-scan's own report events from a previous scan.
    if (ev.probeId.startsWith("secret.leak.")) continue;
    const text = safeStringify({ stage: ev.stage, payload: ev.payload });
    for (const s of secrets) {
      if (text.includes(s)) {
        leakSites.push({ where: "probe", probeId: ev.probeId, logicalClock: ev.logicalClock, secretLast4: s.slice(-4) });
      }
    }
    // URL scan: any call-kind event carrying a url/path is checked for keys in
    // the URL itself and for the ?key= query-param pattern.
    if (ev.kind === "call") {
      const p = ev.payload as { url?: string; path?: string };
      const urlText = `${p?.url ?? ""} ${p?.path ?? ""}`;
      for (const s of secrets) {
        if (urlText.includes(s)) {
          urlLeakSites.push({ where: "probe", probeId: ev.probeId, logicalClock: ev.logicalClock, secretLast4: s.slice(-4) });
        }
      }
      if (/[?&]key=/.test(urlText)) keyInUrlPattern = true;
    }
  }

  logs.forEach((line, index) => {
    for (const s of secrets) {
      if (line.includes(s)) leakSites.push({ where: "log", index, secretLast4: s.slice(-4) });
    }
  });

  errors.forEach((err, index) => {
    const text = safeStringify(err);
    for (const s of secrets) {
      if (text.includes(s)) leakSites.push({ where: "error", index, secretLast4: s.slice(-4) });
    }
  });

  const report: LeakScanReport = {
    scannedEvents: events.length,
    scannedLogs: logs.length,
    scannedErrors: errors.length,
    secretsSearched: secrets.length,
    rawKeyFound: leakSites.length > 0,
    leakSites,
    keyInUrl: urlLeakSites.length > 0 || keyInUrlPattern,
    urlLeakSites,
  };

  bus.emit("secret.leak.scan", "secret.leak", "decision", {
    scannedEvents: report.scannedEvents,
    scannedLogs: report.scannedLogs,
    scannedErrors: report.scannedErrors,
    secretsSearched: report.secretsSearched,
    rawKeyFound: report.rawKeyFound,
    leakSites: report.leakSites,
  });

  // Show the shape (and ONLY the shape) that redaction ever produces, using the
  // most recent redact-boundary event as the live sample.
  const lastBoundary = bus.last("vault.redact.boundary");
  const sample = (lastBoundary?.payload as { key?: unknown } | undefined)?.key ?? {
    present: true, last4: "(none redacted yet)", provider: "(n/a)", keyLen: 0,
  };
  bus.emit("secret.leak.redactionShape", "secret.leak", "value", { shownForm: sample });

  bus.emit("secret.leak.urlScan", "secret.leak", "decision", {
    keyInUrl: report.keyInUrl,
    urlLeakSites: report.urlLeakSites,
    reason: report.keyInUrl
      ? "a key or ?key= pattern appeared in an outbound URL — build-stopping"
      : "Gemini auth via x-goog-api-key header, not ?key=; nothing in any query string",
  });

  return report;
}
