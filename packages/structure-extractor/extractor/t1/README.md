# structure-extractor/extractor/t1

T1 structural extraction: `engine.py` wraps tree-sitter with ERROR/MISSING collection and the byte-exact reprint check; `extract.py` mints nodes via the canonical structural identity and emits anchors; `interpret_code.py`/`interpret_docs.py` promote the per-language matches; capture rules live in `tags/`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-structure-extractor.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `__init__.py` | 1 | Re-exports Anchor and extract_t1 from extract — the t1 package surface. |
| `common.py` | 71 | T1 shared datatypes/helpers: Anchor and _RawNode records, first-line signature slicing, top-level checks (python decorated defs; c/cpp nesting walk), dotted module naming and earliest-capture lookup. |
| `engine.py` | 92 | tree-sitter wrapper: grammar metadata, parse() with ERROR/MISSING collection and the byte-exact reprint check, tags.scm loading + deterministic match ordering, node text slicing; declares which languages use DIY vs first-party tags. |
| `extract.py` | 146 | extract_t1 facade: per SourceSet probes grammar/DIY warnings, parses each file, dispatches the per-language interpreters, mints nodes via the canonical structural identity (probed preimages, loud dedup), validates + provenance-stamps every node, emits anchors and roundtrip/count probes. |
| `interpret_code.py` | 133 | Match interpreters for python/go/c/cpp/lean: promote top-level defs/classes/decls (nested rejected with reasons), collect python call/base anchors with query offsets and dynamic flags, lean earliest-identifier decl naming and import anchors. |
| `interpret_docs.py` | 138 | Match interpreters for latex/typst: sections/labels/theorem envs/figures promoted (unregistered environments and non-figure calls rejected with reasons), labelref/cite/include and ref/import anchors collected; typst let-binding names deduped to the earliest ident with body idents rejected. |
