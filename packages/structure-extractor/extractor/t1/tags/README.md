# structure-extractor/extractor/t1/tags

Tree-sitter capture rules per language: first-party capture semantics for c/cpp/go/python; DIY rules for lean/latex/typst (DIY status is flagged per-run by the T1 probes).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-structure-extractor.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `c.scm` | 4 | Tree-sitter capture rules for C: top-level functions, structs and declarations (first-party capture semantics). |
| `cpp.scm` | 6 | Tree-sitter capture rules for C++: functions (plain + qualified), classes/structs and namespaces (first-party capture semantics). |
| `go.scm` | 5 | Tree-sitter capture rules for Go: functions, methods, type declarations and the package clause (first-party capture semantics). |
| `python.scm` | 7 | Tree-sitter capture rules for Python: function/class definitions plus call and superclass T2 anchors (first-party capture semantics). |
| `lean.scm` | 10 | DIY tree-sitter capture rules for Lean: def/theorem/structure/section declarations and the import T2 anchor; DIY status flagged per-run by the T1 probes. |
| `latex.scm` | 16 | DIY tree-sitter capture rules for LaTeX: sections, label definitions, newtheorem envs, generic environments (figure/theorem promotion in code) and labelref/cite/include T2 anchors. |
| `typst.scm` | 17 | DIY tree-sitter capture rules for Typst: headings, labels, let declarations, call captures (figure promotion in code) and ref/import T2 anchors. |
