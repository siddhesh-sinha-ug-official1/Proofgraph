"""Codegen: schema.json -> schema.md (the human spec).

schema.json is the ONE source of truth; the human spec is a PROJECTION of it.
All enums, the version tag, and the id patterns below are pulled from the
parsed JSON — never hand-maintained in parallel.

graph-schema.ts is NO LONGER generated here.  It was a SECOND, divergent TS
projection: this cell's old generator emitted the pre-amendment format (no
SCHEMA_REVISION / NODE_KINDS arrays / OUTLINE_WORST_ORDER / worstOfVerdict),
so the v0.1 amendment that landed canonically in
packages/schema/gen/graph-schema.ts silently never reached the cell — and
nothing gated the gap (S0 only byte-compared the file against THIS generator).
The cell's TS projection is consumed by nothing (every TS import in the tree
resolves packages/schema/gen/graph-schema.ts), so the cell now byte-mirrors the
canonical projection instead of re-deriving a rival one: S0 byte-syncs
schema/graph-schema.ts against packages/schema/gen/graph-schema.ts, and
tests/test_canonical_sync.py gates it loudly (Wave-A / cluster-U1 remediation,
2026-08-16).
"""
from .schema_tools import canonical_json, schema_hash, node_kinds_of, edge_kinds_of


def generate_md(schema_obj):
    version = schema_obj["schemaVersion"]
    shash = schema_hash(schema_obj)
    node_kinds = " | ".join(node_kinds_of(schema_obj))
    edge_kinds = " | ".join(edge_kinds_of(schema_obj))
    node_props = schema_obj["$defs"]["Node"]["properties"]
    langs = " | ".join(node_props["lang"]["enum"])
    verdicts = " | ".join(node_props["fill"]["properties"]["status"]["enum"])
    origins = " | ".join(node_props["origin"]["enum"])
    tiers = " | ".join(node_props["provenance"]["properties"]["tier"]["enum"])

    # v0.1 amendment (assembly ruling 4): the worst-order is DATA in schema.json
    # ("outlineWorstOrder", split tokens — the fused "none/green" is banned from
    # data), so this projection derives it instead of hand-carrying prose.
    order = schema_obj.get("outlineWorstOrder")
    worst_order = " > ".join(order) if order else "red > amber > blue > definition > lemma > none/green"
    policy = schema_obj.get("outlinePolicy", {})
    mapping = schema_obj.get("worstTokenToStatus", {})
    amendment_lines = ""
    if order:
        amendment_lines = (
            f"\nIndex 0 is worst. Unrecognized token: {policy.get('unrecognizedToken', 'rank WORST and report the offending token')}."
            f" Banned tokens: {', '.join(policy.get('bannedTokens', [])) or '(none)'}.\n\n"
            "worstTokenToStatus: "
            + ", ".join(f"{k}->{v}" for k, v in mapping.items()) + "\n")

    return f'''# ProofGraph Frozen Schema — human spec

GENERATED from `schema.json` (the canonical machine source of truth). Do not edit by hand.

schemaVersion: {version}
schemaHash: {shash}

A change to any kind bumps the version and changes the hash; any consumer pinned
to the old pair MUST fail fast (see `src/schema_tools.py::check_pin`).

## Kinds (cross-artifact check anchors — parsed by the S0 crosscheck)

node kinds: {node_kinds}
edge kinds: {edge_kinds}
langs: {langs}
verdicts: {verdicts}
origins: {origins}
tiers: {tiers}

## The constitution (Frozen Schema v0)

```
Node = {{
  id:        string,   // content-addressed = hash(lang, kind, canonicalName, normalizedSpan); stable across reformatting
  kind:      {node_kinds},
  lang:      {langs},
  name:      string,               // canonical / qualified name
  signature: string | null,
  span:      {{ file: string, byteStart: int, byteEnd: int }},
  fill:      {{ status: {verdicts}, source: string }},
                                   // FILL = this node's OWN compiler/kernel verdict. green ONLY from a real verdict.
  outline:   {{ status: {verdicts}, worstOf: string[] }} | null,
                                   // OUTLINE = transitive trust base, worst-case-wins. Computed LAST (gap analysis).
  origin:    {origins},   // given=external/blue, assumed=debt/amber, checked=we verified
  provenance:{{ tier: {tiers}, extractor: string, resolved: bool }}
}}

Edge = {{
  id:        string,   // hash(kind, srcId, dstId)
  kind:      {edge_kinds},
  srcId:     string,   // Node.id
  dstId:     string,   // Node.id, or an explicit unresolved-target placeholder
  resolved:  bool,     // TRUE only if a resolver actually bound dst. FALSE = syntactic tag (a name at a use-site).
  resolver:  string,   // extractor/tier that resolved it; "" if unresolved
  provenance:{{ tier: {tiers}, extractor: string }}
}}
```

## Tiers

- T1 = structure (local nodes: this span IS a loop/def/theorem).
- T2 = relationships (a resolved edge between nodes).
- T3 = graph properties (computed on the edge set: cycles, reachability, unused).

## Worst-case-wins order for OUTLINE

{worst_order}
{amendment_lines}
## Hard invariants

- `fill.status = green` ONLY from a real compiler/kernel verdict; `unknown != green`.
- `resolved=false` is a **lead, not an edge** — it may never be presented as a real
  relationship and never enters the T3 graph.
- Every node and edge carries `provenance` — no anonymous data in the graph.

## Projections

Text (byte-exact round-trippable source — the C1 fixpoint), graph (`{{nodes,edges}}`
JSON), and flat (node list) all carry identical `id`s; round-trip gates PROVE
agreement.  `resolved=false` leads are carried in a separate `leads` array, never
in `edges`.

## Content-addressing (implementation choice, revisitable)

SHA-256, hex, first 16 chars, domain-separated preimages joined by the unit
separator `\\x1f`:

- node: `node:{version}` ␟ lang ␟ kind ␟ canonicalName ␟ file ␟ path
- edge: `edge:{version}` ␟ kind ␟ srcId ␟ dstId

`normalizedSpan` = the reformatting-invariant structural locator `{{file, path}}`
(NOT byte offsets); `Node.span` holds the raw bytes and is used only for reprint.
'''


def regenerate(schema_obj):
    """Return {filename: content} for the cell-generated artifacts.

    graph-schema.ts is intentionally ABSENT — it is byte-synced from the
    canonical projection (packages/schema/gen/graph-schema.ts) by S0, not
    generated here.  See the module docstring.
    """
    return {
        "schema.md": generate_md(schema_obj),
    }
