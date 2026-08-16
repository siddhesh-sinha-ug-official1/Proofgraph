; latex — ⚠ DIY tags.scm (hand-authored against latex-lsp/tree-sitter-latex as
; bundled by tree-sitter-language-pack). The grammar is unusually semantic: it
; ships distinctly typed relationship nodes (label_definition, label_reference,
; citation, latex_include, theorem_definition) — anchors present, NONE resolved.
(section (curly_group (text) @name)) @definition.section
(subsection (curly_group (text) @name)) @definition.section
(label_definition (curly_group_label (label) @name)) @definition.label
(theorem_definition (curly_group_text_list (text) @name)) @definition.theoremenv

; environments: figure envs and \newtheorem-registered envs are promoted in code
(generic_environment (begin (curly_group_text (text) @envname))) @envnode

; T2 anchors — feed the LaTeX dock's references/cites/includes candidates
(label_reference (curly_group_label_list (label) @anchor.labelref)) @reference.label
(citation (curly_group_text_list (text) @anchor.cite)) @reference.cite
(latex_include (curly_group_path (path) @anchor.include)) @reference.include
