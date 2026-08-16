# editor-shell/scripts/fixture-gen

Fixture-generator sections: `helpers.mjs` (canonical mint via gen/ids.ts plus span math), `fixtures-basic.mjs` and `fixtures-edge.mjs` author the fixture files byte-exactly, `outline-cases.mjs` the 8 worst-case-wins outline cases.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `helpers.mjs` | 63 | Generator helpers: sha256/utf8len, moduleNameOf, mintId via canonical computeNodeIdentity from packages/schema/gen/ids.ts, makeNode (provenance tier T1/resolved:true), blockSpan/tokenSpan/utf8ByteOffset span math. |
| `fixtures-basic.mjs` | 164 | Authors clean.py (module/add/double/unused_helper + a foreign-file node) and type-error.py (stale-green broken + error/warning diagnostic rules with related/quickfix/tags) byte-exactly, recording nodes, meta, symbols, definitions and expected offsets. |
| `fixtures-edge.mjs` | 175 | Authors the edge fixtures byte-exactly: multibyte.py (multibyte prefix before the error token + independent utf-16 expectations), whitespace.py (BOM+CRLF+tabs+trailing ws; spans include the BOM), nested.py (class/methods + a planted no-node __str__ symbol), tier-g.tex (schema-claims-green-without-compiler). |
| `outline-cases.mjs` | 15 | The 8 outline-fixture.json worst-case-wins cases (including empty worstOf -> none and null -> not-yet-computed). |
