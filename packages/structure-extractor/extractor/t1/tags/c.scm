; c — first-party capture semantics (mirrors upstream tree-sitter-c tags.scm)
(function_definition declarator: (function_declarator declarator: (identifier) @name)) @definition.function
(struct_specifier name: (type_identifier) @name) @definition.class
(declaration declarator: (init_declarator declarator: (identifier) @name)) @definition.decl
