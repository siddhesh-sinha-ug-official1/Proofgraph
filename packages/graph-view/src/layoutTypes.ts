/**
 * S4 — LAYOUT shared shapes: the normalized engine result types, the engine
 * name/options/output contracts. Split from layout.ts (SUB200 restructure);
 * layout.ts re-exports everything here, so importers of "./layout" are
 * unchanged.
 */

export interface ElkPoint { x: number; y: number }
export interface ElkSection { startPoint: ElkPoint; endPoint: ElkPoint; bendPoints: ElkPoint[] }
export interface ElkResultNode { id: string; x: number; y: number; width: number; height: number }
export interface ElkResultEdge { id: string; sections: ElkSection[] }
export interface ElkResult { children: ElkResultNode[]; edges: ElkResultEdge[] }

export type EngineName = "elkjs" | "@dagrejs/dagre";

export interface LayoutOptions {
  engine?: EngineName;
  /** Browser demo injects a Vite-built ELK worker factory; Node tests leave it null. */
  workerFactory?: (() => Worker) | null;
  workerUrl?: string;
}

export interface LayoutOutput {
  result: ElkResult;
  engine: { name: EngineName; version: string; spdx: string; worker: boolean };
  cause: string;
}

export async function engineVersion(name: EngineName): Promise<string> {
  try {
    if (name === "elkjs") {
      const pkg = await import("elkjs/package.json");
      return (pkg as { version?: string }).version ?? (pkg as { default?: { version?: string } }).default?.version ?? "unknown";
    }
    const pkg = await import("@dagrejs/dagre/package.json");
    return (pkg as { version?: string }).version ?? (pkg as { default?: { version?: string } }).default?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
