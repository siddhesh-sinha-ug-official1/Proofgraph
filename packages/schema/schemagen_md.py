"""Generator for gen/schema.md — the human-readable spec projection.

Template + generator moved verbatim from schemagen.py (SUB200 restructure);
schemagen.py remains the facade and the CLI.
"""
try:
    from .schema_tools import schema_hash
    from .schemagen_common import _fill, _schema_facts
except ImportError:  # imported flat (packages/schema on sys.path)
    from schema_tools import schema_hash
    from schemagen_common import _fill, _schema_facts


# ── gen/schema.md ────────────────────────────────────────────────────────────

_SCHEMA_MD = '''# ProofGraph Frozen Schema — human spec

GENERATED from `schema.json` (the canonical machine source of truth) by `schemagen.py`. Do not edit by hand.

schemaVersion: @VERSION@
schemaRevision: @REVISION@ (document revision — the Graph envelope const stays "@VERSION@")
schemaHash: @HASH@

A change to any kind bumps the version and changes the hash; any consumer pinned
to the old pair MUST fail fast (see `schema_tools.py::check_pin`).  The pinned
pair lives in the `PIN` file (Python: `pin.py::assert_pin`; TypeScript:
`gen/pin.ts::checkPin`).

## Kinds (cross-artifact check anchors — parsed by the S0 crosscheck)

node kinds: @NODE_KINDS@
edge kinds: @EDGE_KINDS@
langs: @LANGS@
verdicts: @FILLS@
origins: @ORIGINS@
tiers: @TIERS@

## The constitution (Frozen Schema v0)

```
Node = {
  id:        string,   // content-addressed = hash(lang, kind, canonicalName, normalizedSpan); stable across reformatting
  kind:      @NODE_KINDS@,
  lang:      @LANGS@,
  name:      string,               // canonical / qualified name
  signature: string | null,
  span:      { file: string, byteStart: int, byteEnd: int },
  fill:      { status: @FILLS@, source: string },
                                   // FILL = this node's OWN compiler/kernel verdict. green ONLY from a real verdict.
  outline:   { status: @FILLS@, worstOf: string[] } | null,
                                   // OUTLINE = transitive trust base, worst-case-wins. Computed LAST (gap analysis).
  origin:    @ORIGINS@,   // given=external/blue, assumed=debt/amber, checked=we verified
  provenance:{ tier: @TIERS@, extractor: string, resolved: bool }
}

Edge = {
  id:        string,   // hash(kind, srcId, dstId)
  kind:      @EDGE_KINDS@,
  srcId:     string,   // Node.id
  dstId:     string,   // Node.id, or an explicit unresolved-target placeholder
  resolved:  bool,     // TRUE only if a resolver actually bound dst. FALSE = syntactic tag (a name at a use-site).
  resolver:  string,   // extractor/tier that resolved it; "" if unresolved
  provenance:{ tier: @TIERS@, extractor: string }
}
```

`Node.provenance.resolved` (single frozen definition): @RESOLVED_DESC@.

## Tiers

- T1 = structure (local nodes: this span IS a loop/def/theorem).
- T2 = relationships (a resolved edge between nodes).
- T3 = graph properties (computed on the edge set: cycles, reachability, unused).

## Worst-case-wins order for OUTLINE

@ORDER_GT@

- The tokens are SPLIT: `none` and `green` are separate entries; the fused
  spelling @BANNED_MD@ is BANNED from data (it survives only as historical prose).
- Unrecognized-token policy (single, shared): @POLICY@ — an unrecognized
  token can never silently yield a green ring.

### Worst token → displayed status

| worst token | displayed status |
| --- | --- |
@WTS_ROWS@

## Unresolved-target placeholder

`@PLACEHOLDER_PREFIX@` + rawRefName (form: `@PLACEHOLDER_FORM@`) — the RAW
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

SHA-256, hex, first @TRUNCATE@ chars, domain-separated preimages joined by the unit
separator `\\x1f`:

- node: `@NODE_TAG@` ␟ @NODE_FIELDS@
- edge: `@EDGE_TAG@` ␟ @EDGE_FIELDS@

`normalizedSpan` = @NORMALIZED_SPAN@; `Node.span` holds the raw bytes and is
used only for reprint.
'''


def generate_md(schema_obj):
    f = _schema_facts(schema_obj)
    sep = " ␟ "
    wts_rows = "\n".join(f"| {k} | {v} |" for k, v in f["wts"].items())
    return _fill(_SCHEMA_MD, {
        "VERSION": f["version"],
        "REVISION": f["revision"],
        "HASH": schema_hash(schema_obj),
        "NODE_KINDS": " | ".join(f["node_kinds"]),
        "EDGE_KINDS": " | ".join(f["edge_kinds"]),
        "LANGS": " | ".join(f["langs"]),
        "FILLS": " | ".join(f["fills"]),
        "ORIGINS": " | ".join(f["origins"]),
        "TIERS": " | ".join(f["tiers"]),
        "RESOLVED_DESC": f["resolved_desc"],
        "ORDER_GT": " > ".join(f["order"]),
        "BANNED_MD": " / ".join(f"`{b}`" for b in f["banned"]),
        "POLICY": f["policy"],
        "WTS_ROWS": wts_rows,
        "PLACEHOLDER_PREFIX": f["placeholder_prefix"],
        "PLACEHOLDER_FORM": f["placeholder_form"],
        "TRUNCATE": str(f["hash_length"]),
        "NODE_TAG": f["node_tag"],
        "NODE_FIELDS": sep.join(f["node_fields"]),
        "EDGE_TAG": f["edge_tag"],
        "EDGE_FIELDS": sep.join(f["edge_fields"]),
        "NORMALIZED_SPAN": f["normalized_span"],
    })
