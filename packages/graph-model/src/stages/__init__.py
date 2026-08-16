from . import (s0_schema, s1_ingest, s2_node, s3_edge, s4_fill, s5_t3,
               s6_project, s7_roundtrip)

# (stage name on the probe bus, stage module) in pipeline order
PIPELINE = [
    ("schema", s0_schema),
    ("ingest", s1_ingest),
    ("node", s2_node),
    ("edge", s3_edge),
    ("fill", s4_fill),
    ("t3", s5_t3),
    ("project", s6_project),
    ("roundtrip", s7_roundtrip),
]
