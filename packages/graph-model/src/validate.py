"""Hand-rolled stdlib validator for the subset of JSON Schema that schema.json
uses (type/enum/const/pattern/required/properties/additionalProperties/items/
$ref-into-$defs).  Kept stdlib-only so the import boundary of every consuming
cell stays exactly {stdlib (+ its own deps)} — no third-party jsonschema.

On top of the JSON-Schema pass, `validate_graph` enforces the frozen leads-
segregation invariant: `resolved=false` is a LEAD, not an edge — it may never
be carried in `edges[]` (and `resolved=true` may never hide in `leads[]`).
"""
import re

_TYPE_CHECKS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
}


def _resolve_ref(ref, root):
    assert ref.startswith("#/"), f"only local refs supported, got {ref}"
    node = root
    for part in ref[2:].split("/"):
        node = node[part]
    return node


def _validate(value, spec, root, path, errors):
    if "$ref" in spec:
        _validate(value, _resolve_ref(spec["$ref"], root), root, path, errors)
        return
    if "const" in spec:
        if value != spec["const"]:
            errors.append(f"{path}: expected const {spec['const']!r}, got {value!r}")
        return
    if "enum" in spec:
        if value not in spec["enum"]:
            errors.append(f"{path}: {value!r} not in enum {spec['enum']}")
        return
    if "type" in spec:
        types = spec["type"] if isinstance(spec["type"], list) else [spec["type"]]
        if not any(_TYPE_CHECKS[t](value) for t in types):
            errors.append(f"{path}: expected type {types}, got {type(value).__name__}")
            return
    if isinstance(value, str) and "pattern" in spec:
        # Python's `$` matches before a trailing newline; the frozen id
        # patterns mean end-of-string, so harden the anchor to \Z.
        pattern = spec["pattern"]
        if pattern.endswith("$") and not pattern.endswith("\\$"):
            pattern = pattern[:-1] + r"\Z"
        if not re.search(pattern, value):
            errors.append(f"{path}: {value!r} does not match pattern {spec['pattern']!r}")
    if isinstance(value, int) and not isinstance(value, bool) and "minimum" in spec:
        if value < spec["minimum"]:
            errors.append(f"{path}: {value} < minimum {spec['minimum']}")
    if isinstance(value, dict):
        props = spec.get("properties", {})
        for req in spec.get("required", []):
            if req not in value:
                errors.append(f"{path}: missing required property {req!r}")
        if spec.get("additionalProperties") is False:
            for k in value:
                if k not in props:
                    errors.append(f"{path}: additional property {k!r} not allowed")
        for k, v in value.items():
            if k in props:
                _validate(v, props[k], root, f"{path}.{k}", errors)
    if isinstance(value, list) and "items" in spec:
        for i, item in enumerate(value):
            _validate(item, spec["items"], root, f"{path}[{i}]", errors)


def validate_graph(graph_obj, schema_obj):
    """Validate a {schemaVersion,nodes,edges,leads?} object against $defs.Graph
    plus the leads-segregation invariant.
    Returns (conforms: bool, errors: [str]) — errors in full, no truncation."""
    errors = []
    _validate(graph_obj, schema_obj["$defs"]["Graph"], schema_obj, "graph", errors)
    if isinstance(graph_obj, dict):
        edges = graph_obj.get("edges")
        for i, edge in enumerate(edges if isinstance(edges, list) else []):
            if isinstance(edge, dict) and edge.get("resolved") is False:
                errors.append(
                    f"graph.edges[{i}]: resolved=false is a lead, not an edge — "
                    f"carried in leads[], never in edges[]")
        leads = graph_obj.get("leads")
        for i, lead in enumerate(leads if isinstance(leads, list) else []):
            if isinstance(lead, dict) and lead.get("resolved") is True:
                errors.append(
                    f"graph.leads[{i}]: resolved=true is an edge, not a lead — "
                    f"carried in edges[], never in leads[]")
    return (len(errors) == 0, errors)
