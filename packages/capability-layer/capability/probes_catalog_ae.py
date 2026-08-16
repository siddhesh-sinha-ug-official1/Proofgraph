"""Probe catalog sections, stages A-E (discovery / gate / score / tree /
shim).  Registration order preserved from the original probes.py; the
aggregate catalog is ELEMENT-FOR-ELEMENT identical (probes.py imports the
section modules in original order)."""

from .probes_bus import register

# ---------------------------------------------------------------------------
# THE CATALOG — every lead of Section 6, registered up front.
# probeId scheme: capability.<stage>.<lead>
# ---------------------------------------------------------------------------

# --- Stage A: discovery sweep ---------------------------------------------
register("capability.discovery.input", "input", "LangProfile",
         "the language + its assumed compiler/typing/pkg-mgr being onboarded")
register("capability.discovery.source.query", "call", "{source,url,query,response:{hits,raw}}",
         "one index source consulted: exact request and raw response (reproduces the sweep)")
register("capability.discovery.candidate", "node", "CandidateServer",
         "a candidate server found: steward, source, dates, license, reuses-compiler guess")
register("capability.discovery.grammar", "value", "{exists,partial,source}",
         "whether the tree-sitter floor is free or must be authored")
register("capability.discovery.scip", "value", "{indexer:string|null}",
         "whether whole-repo precise nav is available offline")
register("capability.discovery.compilerMode", "value", "string",
         "one discovered compiler analysis mode — this decides the CT ceiling")
register("capability.discovery.compilerHelp", "call",
         "{argv,stdout,stderr,exitCode}",
         "the decisive `<compiler> --help` invocation, request AND response")
register("capability.discovery.error", "error", "{argv,error}",
         "a discovery-stage external-call failure, surfaced never swallowed "
         "(a broken compiler argv must not masquerade as 'no analysis surface')")
register("capability.discovery.libSource", "value", "{kind,ref}",
         "where the library inventory will come from (registry / doc-json / stubs)")
register("capability.discovery.none", "branch", "{reason}",
         "branch taken when no server exists in any index — the DIY build path")
register("capability.discovery.output", "output", "DiscoveryResult",
         "the assembled sweep result feeding stages B/C/D")
register("capability.discovery.timing", "timing", "{}",
         "how long the sweep took (wallNanos only; budget the runbook's 5-min box)")

# --- Stage B: maintenance & license gate ----------------------------------
register("capability.gate.maintenance", "decision",
         "{candidate,lastRelease,lastCommit,verdict:'keep'|'drop',reason}",
         "whether a candidate is alive; drop archived/stale unless nothing else exists")
register("capability.gate.archived", "branch", "{candidate,reason}",
         "a known-dead server refused (candidate excluded)")
register("capability.gate.license", "decision",
         "{candidate,spdx,verdict:'embed-safe'|'subprocess-only'|'veto',reason}",
         "the S6 license axis — a deep server can be vetoed for shippability")
register("capability.gate.output", "output", "[CandidateServer]",
         "the gated survivors that stages C/D/E may actually use")

# --- Stage C: paper-score (S1–S6) -----------------------------------------
register("capability.score.s1", "decision", "{answer,evidence}",
         "official/blessed OR reuses the real compiler as a library? (compiler-truth candidate)")
register("capability.score.s2", "decision", "{answer,evidence}",
         "statically typed with a real checker? (No → structural ceiling unless gradual tool)")
register("capability.score.s3", "decision", "{answer,evidence}",
         "cross-file name resolution AND dependency indexing? (real workspace semantics)")
register("capability.score.s4", "decision", "{answer,evidence}",
         "completion-after-import resolves members WITH types/signatures? (deep library surfacing)")
register("capability.score.s5", "decision", "{answer,evidence}",
         "released/committed within ~6–12 months, not archived, not solely single-maintainer?")
register("capability.score.s6", "decision", "{answer,evidence}",
         "OSS AND legally embeddable in any editor? (no license trap)")
register("capability.score.paperTier", "value", "Tier",
         "the provisional tier BEFORE probing — the README's claim")
register("capability.score.grades", "value", "{maintGrade,licenseGrade}",
         "whether you can actually ship the depth you found")

# --- Stage D: decision-tree walk ------------------------------------------
register("capability.tree.rung.official", "branch", "{taken,reason}",
         "rung 1: official/blessed server? (almost always compiler-truth for static langs)")
register("capability.tree.rung.community", "branch", "{taken,reason}",
         "rung 2: community server reusing the real frontend? (CT; check maintenance+license)")
register("capability.tree.rung.structure", "branch", "{taken,reason}",
         "rung 3: maintained structure server? (real nav, NOT type truth)")
register("capability.tree.rung.grammar", "branch", "{taken,reason}",
         "rung 4: tree-sitter grammar exists? (the uniform floor)")
register("capability.tree.rung.plaintext", "branch", "{taken,reason}",
         "rung 5: plaintext + your own lexer / compiler CLI")
register("capability.tree.rejected", "branch", "{rung,whyRejected}",
         "why each deeper rung was not reachable — the honest-ceiling narrative")
register("capability.tree.dynamicCeiling", "decision", "{typing,cappedAt,note}",
         "the second, independent ceiling: dynamic languages cap at S (language's nature)")
register("capability.tree.extras", "value", "{grammar,scip,libSources}",
         "the three compose-with-any-tier add-ons always collected at every node")
register("capability.tree.chosen", "decision", "{chosenRung,provisionalTier}",
         "the rung the walk stopped at (first Yes)")

# --- Stage E: shim ladder (ybg-lsp over ybc) ------------------------------
register("capability.shim.readMsg", "call", "{raw,parsed}",
         "the LSP framing parse (Content-Length header → JSON body); catches a dropped CRLF")
register("capability.shim.send", "call", "{json}",
         "every server→client message, verbatim on the wire")
register("capability.shim.initialize", "output", "ServerCapabilities",
         "the initialize result — the degrade map published; what P0 reads back")
register("capability.shim.encoding.negotiate", "decision", "{clientOffered,chosen}",
         "positionEncoding negotiation — UTF-8 to dodge the silent column corruptor")
register("capability.shim.check.call", "call", "{argv,stdout,stderr,exitCode}",
         "the compiler-truth source — a real `ybc check --format=json` invocation")
register("capability.shim.check.diag", "node", "{accepted,raw,lsp?,why?}",
         "each mapped diagnostic (and each rejected raw entry with why)")
register("capability.shim.columnMap", "value", "{ybcLine,ybcCol,ybcEndCol,lspChar,encoding}",
         "the encoding-aware column conversion — the single most bug-prone line")
register("capability.shim.query.type", "call", "{argv,stdout,stderr,exitCode}",
         "powers hover — real inference via `ybc query type`")
register("capability.shim.query.def", "call", "{argv,stdout,stderr,exitCode}",
         "powers cross-file definition via `ybc query def`")
register("capability.shim.query.refs", "call", "{argv,stdout,stderr,exitCode}",
         "powers references via `ybc query refs`")
# [ADVERSARIAL AUDIT] description corrected to what the shim actually routes
# through this lead: hover uses query.type, and stage H's static inventory has
# its own lead (capability.lib.static).
register("capability.shim.doc.call", "call", "{argv,stdout,stderr,exitCode}",
         "the shim's other ybc invocations: `ybc doc --format=json` (completion "
         "members + docs — the on-demand inventory path), `--version` "
         "(initialize), `--emit=ast` (documentSymbol)")
register("capability.shim.stub", "value", "{method,result,reason}",
         "an honest stub — a known gap, not a mystery")
register("capability.shim.fallback", "branch", "{reason,cappedAt}",
         "the honest fallback: no analysis API ⇒ capped at the grammar floor")
register("capability.shim.error", "error", "{argv,stderr,exitCode}",
         "any ybc crash / nonzero exit surfaced, never swallowed")
