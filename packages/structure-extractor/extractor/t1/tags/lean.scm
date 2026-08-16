; lean — ⚠ DIY tags.scm (upstream grammar ships none; hand-authored against the
; tree-sitter-lean grammar bundled by tree-sitter-language-pack).
; NOTE: `lemma` parses as a (theorem) node whose first token is the lemma keyword.
(declaration (def (identifier) @name)) @definition.decl
(declaration (theorem (identifier) @name)) @definition.theorem
(declaration (structure (identifier) @name)) @definition.decl
(section (identifier) @name) @definition.section

; T2 anchors — imports feed the Lean dock's `imports` candidates
(import (identifier) @anchor.import) @reference.import
