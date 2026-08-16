/**
 * React context carrying the probe bus into node/edge components rendered by
 * React Flow (they render inside the canvas, so context reaches them).
 * Null-safe: a component rendered outside a provider simply doesn't emit —
 * but GraphView always provides, so in this cell every render is probed.
 */

import { createContext, useContext } from "react";
import type { ProbeBus } from "./probeBus";

export const ProbeBusContext = createContext<ProbeBus | null>(null);

export function useProbeBus(): ProbeBus | null {
  return useContext(ProbeBusContext);
}
