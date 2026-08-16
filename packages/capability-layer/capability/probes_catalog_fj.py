"""Probe catalog sections, stages F-J (floor / scip / lib / wire / probe).
Registration order preserved from the original probes.py."""

from .probes_bus import register

# --- Stage F: tree-sitter floor -------------------------------------------
register("capability.floor.parse", "call", "{textBytes,errorNodes,missingNodes,rootType}",
         "the grammar parse; ERROR/MISSING nodes are the error-tolerance signal")
register("capability.floor.nodeTypes", "value", "[NodeType]",
         "the full node-types.json set; named:false entries = keywords/operators/punctuation")
register("capability.floor.highlights", "value", "{capture:members}",
         "highlights.scm captures — a categorized index of the language's vocabulary")
register("capability.floor.symbol", "node", "{name,kind,span}",
         "a T1 structure node from the tree walk — the floor you never fall below")
register("capability.floor.gotoHeuristic", "edge", "{name,span,resolved:false}",
         "same-file name-heuristic goto — explicitly a LEAD, not an edge (resolved MUST be false)")
register("capability.floor.tier", "value", "{depthTier:'G',schemaTier:'T1'}",
         "the mapping: grammar floor = depth G = schema T1 structure")

# --- Stage G: SCIP index ---------------------------------------------------
register("capability.scip.emit.call", "call", "{invocation,indexPath,bytes}",
         "emitting one SCIP index from the compiler's typed AST across project + deps")
register("capability.scip.document", "node", "{relativePath,symbols}",
         "one SCIP Document per file — the per-file unit of the index")
register("capability.scip.occurrence", "edge", "{symbol,range,role}",
         "a SCIP Occurrence (def/ref) — repo-wide truth LSP cannot give per-call")
register("capability.scip.symbolInfo", "node", "{symbol,signature,kind}",
         "SymbolInformation for hovers/monikers — cross-repo symbol identity")
register("capability.scip.ingest", "value", "{symbols,docs,occurrences}",
         "the 'enumerate everything' capability no live LSP call provides")

# --- Stage H: library inventory -------------------------------------------
register("capability.lib.ondemand", "call", "{request,response}",
         "completion after `import lib` then `lib.` — pull-only, precise, resolved by ybc")
register("capability.lib.static", "call", "{argv,stdout,exitCode}",
         "`ybc doc --format=json` — the stub/typeshed equivalent: enumerable per-package API")
register("capability.lib.registry", "call", "{source,packages}",
         "the registry catalog — what libraries exist")
register("capability.lib.nonuniform", "value", "{note,sources}",
         "the honest cap: library tier is assembled from N sources, not uniform — logged, not silent")

# --- Stage I: wire + lifecycle --------------------------------------------
# [ASSEMBLY CHANGE CAP-LEAN] catalog EXTENDED (additive; never shrunk): the
# optional pre-wire workspace-prepare step is a lead, not a silent setup.
register("capability.wire.prepare", "call",
         "{argv,exitCode,stdoutTail,stderrTail}",
         "the workspace-prepare step before wiring (lean: `lake build` so "
         "file workers can resolve imports) — environment setup is measured "
         "state, logged never silent; a failing prepare degrades the battery "
         "honestly instead of aborting")
register("capability.wire.route", "decision", "{fileExt,server}",
         "file-type → server routing decision")
register("capability.wire.spawn", "state", "{pid,argv,state}",
         "server process launched out-of-process (license-safe)")
register("capability.wire.capabilitiesReadback", "value", "ServerCapabilities",
         "what the layer read from initialize — what it will and won't ask this handle for")
register("capability.wire.degrade", "decision", "{method,supported:false,plan}",
         "graceful degradation for anything the shim/server doesn't implement")
register("capability.wire.cache.key", "value", "{ybcVersion,contentHash,lockfileHash}",
         "the cache key; dependencies are the slow-changing precomputable tier")
register("capability.wire.cache.hit", "branch", "{key,hit}",
         "cache hit vs recompute")
register("capability.wire.lifecycle", "state", "{from,to}",
         "spawned → initialized → alive → crashed → restarting → alive; every transition")
register("capability.wire.crash", "error", "{pid,stderr,exitCode}",
         "a server death, surfaced not swallowed")

# --- Stage J: the Capability Probe (P0–P11) -------------------------------
_PROBE_RESULT_T = "ProbeResult{id,ran,verdict,request,response,evidence,licenses}"
register("capability.probe.p0", "value", _PROBE_RESULT_T,
         "P0: initialize; dump ServerCapabilities — the map of what's worth testing")
register("capability.probe.p1", "value", _PROBE_RESULT_T,
         "P1: open a representative file; wait for diagnostics — server alive and analyzing")
register("capability.probe.p2", "value", _PROBE_RESULT_T,
         "P2 (KILLER): inject a deliberate type error — the compiler-truth litmus")
# [ADVERSARIAL AUDIT] payloadType completed: the LSP path also carries
# injectedLine + newErrorsAtInjection (floor path emits the two-key form).
register("capability.probe.p2.inject", "value",
         "{injected,diagnostics,injectedLine?,newErrorsAtInjection?}",
         "the injected source + the diagnostic that came back OR the silence that didn't")
register("capability.probe.p2.verdict", "decision", "{p2:'pass'|'fail',tier:'CT'|'≤S'}",
         "the load-bearing decision: if fail, fill.status=green is forbidden forever")
register("capability.probe.p3", "value", _PROBE_RESULT_T,
         "P3: hover an unannotated variable — real type INFERENCE, not annotation echo")
register("capability.probe.p4", "value", _PROBE_RESULT_T,
         "P4: go-to-definition across files and into a third-party dependency")
register("capability.probe.p5", "value", _PROBE_RESULT_T,
         "P5: find-references across several files — workspace-wide semantic index")
register("capability.probe.p6", "value", _PROBE_RESULT_T,
         "P6: completion after import — library API surfacing WITH types")
register("capability.probe.p7", "value", _PROBE_RESULT_T,
         "P7: cross-file rename — semantic (not textual) rename, a strong depth signal")
register("capability.probe.p8", "value", _PROBE_RESULT_T,
         "P8: semanticTokens / hover on generated symbols — structure servers silently miss these")
register("capability.probe.p9", "value", _PROBE_RESULT_T,
         "P9: call/type hierarchy — OPTIONAL capability; absence is skip, NEVER a depth failure")
register("capability.probe.p10", "value", _PROBE_RESULT_T,
         "P10: time-to-first-useful-response (wallNanos only, never ordered on)")
register("capability.probe.p11", "value", _PROBE_RESULT_T,
         "P11: restart — persisted index (fast) or re-derived?")
register("capability.probe.msg", "call", "{direction,message}",
         "every LSP message inside every probe — the raw wire firehose, no message silenced")
register("capability.probe.measuredTier", "decision", "{measuredTier,overrode}",
         "the tier the battery PROVED; overrides the paper guess")
register("capability.probe.faked", "decision", "{tier,p2,greenAllowed}",
         "the enforcement lead: green is allowed ONLY if tier==CT AND P2 passed")
register("capability.probe.cap", "value", "{what,cap,dropped}",
         "any bound applied by the battery (top-N, sampling) — logged, never silent")
