; go — first-party capture semantics (mirrors upstream tree-sitter-go tags.scm)
(function_declaration name: (identifier) @name) @definition.function
(method_declaration name: (field_identifier) @name) @definition.function
(type_declaration (type_spec name: (type_identifier) @name)) @definition.decl
(package_clause (package_identifier) @name) @definition.module
