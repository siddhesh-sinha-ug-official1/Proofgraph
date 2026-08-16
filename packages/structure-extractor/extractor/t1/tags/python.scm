; python — first-party capture semantics (mirrors upstream tree-sitter-python tags.scm)
(function_definition name: (identifier) @name) @definition.function
(class_definition name: (identifier) @name) @definition.class

; T2 anchors (seeds for the Python dock — not edges at T1)
(call function: (_) @anchor.call)
(class_definition superclasses: (argument_list (_) @anchor.base))
