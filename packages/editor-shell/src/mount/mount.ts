/**
 * S0 — Host & Mount controller (editor-agnostic side).
 *
 * The concrete editor (Monaco in `mount/monaco/`, the stub in tests) reports
 * its truth through `MountInfo`; this controller probes the lifecycle:
 * init → ready (font/theme/features recorded, never assumed) → dispose.
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import type { EditorAdapter } from "./adapter.js";

export interface MountConfig {
  fontFamily: string;
  fontLigatures: boolean;
  theme: string;
  requestedPositionEncoding: "utf-8";
  readOnly: boolean;
}

export class MountController {
  private probe: ProbeBus;
  private initWall: number | null = null;
  private configProbe: ProbeEvent | null = null;

  constructor(probe: ProbeBus) {
    this.probe = probe;
  }

  begin(config: MountConfig, adapter: EditorAdapter): ProbeEvent {
    this.configProbe = this.probe.emit("editor.mount.config.input", { ...config }, null);
    const ref = this.probe.ref(this.configProbe);
    const info = adapter.mountInfo();
    this.probe.emit(
      "editor.mount.wrapper.init",
      { phase: "initializing", wrapperVersion: info.wrapperVersion, adapterKind: adapter.kind },
      ref,
    );
    return this.configProbe;
  }

  ready(adapter: EditorAdapter, modelUri: string, config: MountConfig): ProbeEvent {
    const info = adapter.mountInfo();
    const causeRef = this.configProbe ? this.probe.ref(this.configProbe) : null;

    const readyProbe = this.probe.emit(
      "editor.mount.wrapper.ready",
      { phase: "ready", modelUri, msSinceInit: null },
      causeRef,
    );
    const readyRef = this.probe.ref(readyProbe);

    this.probe.emit(
      "editor.mount.font.applied",
      {
        requested: config.fontFamily,
        resolved: info.fontResolved,
        ligaturesOn: info.ligaturesOn,
      },
      readyRef,
    );
    if (info.fontResolved !== config.fontFamily) {
      this.probe.emit(
        "editor.mount.font.fallback",
        {
          requested: config.fontFamily,
          fellBackTo: info.fontResolved,
          reason: "requested font did not resolve in this environment (font not shipped/loaded)",
        },
        readyRef,
      );
    }
    this.probe.emit(
      "editor.mount.theme.applied",
      {
        themeName: info.themeName,
        tokenColorCount: info.tokenColorCount,
        isDarculaStyle: info.isDarculaStyle,
      },
      readyRef,
    );
    this.probe.emit("editor.mount.features.enabled", { ...info.features }, readyRef);
    this.probe.emit(
      "editor.mount.readonly.guard",
      {
        readOnly: config.readOnly,
        reason: config.readOnly
          ? "read-only projection: edits rejected AND bytes still never mutated"
          : "editable: edits allowed, classified user/programmatic; silent rewrites still forbidden",
      },
      readyRef,
    );
    return readyProbe;
  }

  error(where: string, err: unknown): void {
    this.probe.emit(
      "editor.mount.error",
      {
        where,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? (err.stack ?? null) : null,
      },
      this.configProbe ? this.probe.ref(this.configProbe) : null,
    );
  }

  dispose(modelUri: string, reason: string): void {
    this.probe.emit("editor.mount.dispose", { modelUri, reason }, null);
  }
}
