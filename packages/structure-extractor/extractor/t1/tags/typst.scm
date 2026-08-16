; typst — ⚠ DIY tags.scm (hand-authored against the typst grammar bundled by
; tree-sitter-language-pack, which mirrors typst-syntax SyntaxKind names in
; lowercase: heading, label, ref, import, let, call).
; A (ref) carries its target label text; an (import) carries the path —
; syntactic anchors present, none resolved (that is the Typst dock's job).
(heading (text) @name) @definition.section
(label) @definition.label
(code (let (call (ident) @name))) @definition.decl
(code (let (ident) @name)) @definition.decl

; figure promotion happens in code: a (call (ident)) whose ident text is
; "figure" becomes a figure node (queries stay predicate-free on purpose).
(call (ident) @callee.name)

; T2 anchors — feed the Typst dock's references/imports candidates
(ref) @anchor.ref
(code (import (string) @anchor.importpath)) @reference.import
