// ============================================================================
// Shared adapter machinery — FACADE. The implementation is split by cohesion:
//   ./shared/runtime.ts — retry policy, injectable runtime, HTTP/error shapes,
//                         header helpers
//   ./shared/send.ts    — host allowlist + the send/receive loop with the
//                         retry/stop branch and probe emission for every hop
// This module path remains the import surface for every adapter and test —
// the full public surface is re-exported unchanged.
// ============================================================================

export {
  defaultRetryPolicy, defaultRuntime, headersToObject, parseRetryAfterSec,
} from "./shared/runtime.ts";
export type {
  AdapterRuntime, HttpOk, MappedError, ProviderErrorMapper, RetryPolicy,
} from "./shared/runtime.ts";
export { HOST_ALLOWLIST, sendRequest } from "./shared/send.ts";
export type { SendSpec } from "./shared/send.ts";
