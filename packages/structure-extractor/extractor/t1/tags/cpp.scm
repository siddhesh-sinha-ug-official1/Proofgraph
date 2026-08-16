; cpp — first-party capture semantics (mirrors upstream tree-sitter-cpp tags.scm)
(function_definition declarator: (function_declarator declarator: (identifier) @name)) @definition.function
(function_definition declarator: (function_declarator declarator: (qualified_identifier) @name)) @definition.function
(class_specifier name: (type_identifier) @name) @definition.class
(struct_specifier name: (type_identifier) @name) @definition.class
(namespace_definition name: (namespace_identifier) @name) @definition.decl
