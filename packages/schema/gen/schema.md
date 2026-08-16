# ProofGraph Frozen Schema — human spec

GENERATED from `schema.json` (the canonical machine source of truth) by `schemagen.py`. Do not edit by hand.

schemaVersion: v0
schemaRevision: v0.1 (document revision — the Graph envelope const stays "v0")
schemaHash: 3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c

A change to any kind bumps the version and changes the hash; any consumer pinned
to the old pair MUST fail fast (see `schema_tools.py::check_pin`).  The pinned
pair lives in the `PIN` file (Python: `pin.py::assert_pin`; TypeScript:
`gen/pin.ts::checkPin`).

## Kinds (cross-artifact check anchors — parsed by the S0 crosscheck)

node kinds: module | function | class | theorem | section | label | figure | decl
edge kinds: calls | imports | includes | inherits | references | cites | proof_uses
langs: python | go | c | cpp | lean | latex | typst
verdicts: green | amber | red | blue | unknown
origins: given | assumed | checked
tiers: T1 | T2 | T3

## The constitution (Frozen Schema v0)

```
Node = {
  id:        string,   // content-addressed = hash(lang, kind, canonicalName, normalizedSpan); stable across reformatting
  kind:      module | function | class | theorem | section | label | figure | decl,
  lang:      python | go | c | cpp | lean | latex | typst,
  name:      string,               // canonical / qualified name
  signature: string | null,
  span:      { file: string, byteStart: int, byteEnd: int },
  fill:      { status: green | amber | red | blue | unknown, source: string },
                                   // FILL = this node's OWN compiler/kernel verdict. green ONLY from a real verdict.
  outline:   { status: green | amber | red | blue | unknown, worstOf: string[] } | null,
                                   // OUTLINE = transitive trust base, worst-case-wins. Computed LAST (gap analysis).
  origin:    given | assumed | checked,   // given=external/blue, assumed=debt/amber, checked=we verified
  provenance:{ tier: T1 | T2 | T3, extractor: string, resolved: bool }
}

Edge = {
  id:        string,   // hash(kind, srcId, dstId)
  kind:      calls | imports | includes | inherits | references | cites | proof_uses,
  srcId:     string,   // Node.id
  dstId:     string,   // Node.id, or an explicit unresolved-target placeholder
  resolved:  bool,     // TRUE only if a resolver actually bound dst. FALSE = syntactic tag (a name at a use-site).
  resolver:  string,   // extractor/tier that resolved it; "" if unresolved
  provenance:{ tier: T1 | T2 | T3, extractor: string }
}
```

`Node.provenance.resolved` (single frozen definition): the extractor successfully bound this element's identity; true for every well-formed structural node.

## Tiers

- T1 = structure (local nodes: this span IS a loop/def/theorem).
- T2 = relationships (a resolved edge between nodes).
- T3 = graph properties (computed on the edge set: cycles, reachability, unused).

## Worst-case-wins order for OUTLINE

red > amber > blue > definition > lemma > none > green

- The tokens are SPLIT: `none` and `green` are separate entries; the fused
  spelling `none/green` is BANNED from data (it survives only as historical prose).
- Unrecognized-token policy (single, shared): rank WORST and report the offending token — an unrecognized
  token can never silently yield a green ring.

### Worst token → displayed status

| worst token | displayed status |
| --- | --- |
| red | red |
| amber | amber |
| blue | blue |
| definition | blue |
| lemma | green |
| none | green |
| green | green |

## Unresolved-target placeholder

`unresolved:` + rawRefName (form: `prefix + rawRefName`) — the RAW
referenced name, never hashed.  The placeholder feeds the edge-id preimage, so
its spelling is identity-bearing.

## Hard invariants

- `fill.status = green` ONLY from a real compiler/kernel verdict; `unknown != green`.
- `resolved=false` is a **lead, not an edge** — it may never be presented as a real
  relationship and never enters the T3 graph.
- Every node and edge carries `provenance` — no anonymous data in the graph.

## Projections

Text (byte-exact round-trippable source — the C1 fixpoint), graph (`{nodes,edges}`
JSON), and flat (node list) all carry identical `id`s; round-trip gates PROVE
agreement.  `resolved=false` leads are carried in a separate `leads` array, never
in `edges`.

## Content-addressing (implementation choice, revisitable)

SHA-256, hex, first 16 chars, domain-separated preimages joined by the unit
separator `\x1f`:

- node: `node:v0` ␟ lang ␟ kind ␟ canonicalName ␟ file ␟ path
- edge: `edge:v0` ␟ kind ␟ srcId ␟ dstId

`normalizedSpan` = the reformatting-invariant structural locator {file, path} — NOT byte offsets, NOT content bytes; `Node.span` holds the raw bytes and is
used only for reprint.
