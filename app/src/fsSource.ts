/**
 * App-shell round — fsSource: the shell's feeding tube to the hub's
 * workspace-fs endpoints (APP-SHELL-CONTRACT — HUB-workspace-fs lands the
 * server side in parallel; THIS module codes against the frozen contract
 * shapes and the unit suite mocks exactly them; the live loop belongs to the
 * Integrate stage / acceptance runner, never faked green here).
 *
 * Contract endpoints spoken here (all hub-side path-JAILED; the browser NEVER
 * touches the filesystem):
 *   GET  /workspace            → {root, package, declaredRoots, analyzedAt, pyrightMode}
 *   GET  /fs/list?path=REL     → {entries:[{name, kind:"dir"|"file", size}]}
 *   GET  /fs/file?path=REL     → {path, bytes, sha256}  (utf8|base64)
 *   PUT  /fs/file              → {path, content} → {sha256} — refusal class
 *                                `path-escape` for traversal (hub-probed)
 *   GET  /fs/roots-candidates  → {candidates:[{id,name,kind}]} (roots stay DECLARED)
 *   POST /analyze              → pipeline re-run {root, roots?, extractorConfig?}
 *                                (Integrate-stage reconciliation at the HUB's
 *                                vocabulary — hub/server.py analyze(): 'root'
 *                                is REQUIRED, the re-run config field is
 *                                'extractorConfig' with snake_case keys
 *                                pyright_mode / python_package)
 *
 * Refusal honesty: hub typed {failureClass, detail} bodies pass through
 * VERBATIM as GraphSourceError (path-escape, workspace-not-open, fs-io-error,
 * unknown-endpoint, …); transport death is hub-unreachable; a 200 body off
 * the contract shape is the NAMED fs-shape-mismatch — refused whole — on the
 * fs read/write endpoints (fetchWorkspace, fsList, fsRead, fsWrite,
 * fetchRootsCandidates; pinned by shell.units.fs). POST /analyze and
 * /pins/history 200 bodies pass through as parsed JSON, and /health maps
 * tolerantly (missing fields become nulls) — those three are not shape-gated
 * (adversarial-round doc fix: the old text claimed the gate covered every
 * contract endpoint).
 *
 * SUB200 restructure: this module is now the FACADE over fsSourceCore.ts
 * (transport, doJson, shape refusal) + fsSourceApi.ts (the endpoint
 * functions). Public surface unchanged.
 */

export { FS_SOURCE_VERSION, defaultHttpDo, type HttpDo } from "./fsSourceCore";

export {
  fetchHealth, fetchPinsHistory, fetchRootsCandidates, fetchWorkspace,
  fsList, fsRead, fsWrite, postAnalyze,
  type AnalyzeRequest, type FsEntry, type FsFile, type HealthInfo,
  type RootCandidate, type WorkspaceInfo,
} from "./fsSourceApi";
