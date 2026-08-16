/**
 * Fixture sections: multibyte.py, whitespace.py, nested.py, tier-g.tex
 * (SUB200 restructure: split from ../gen-fixture-nodes.mjs, content
 * byte-identical).
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { blockSpan, makeNode, sha256, utf8ByteOffset, utf8len } from "./helpers.mjs";

// ─── multibyte.py ────────────────────────────────────────────────────────────
export function genMultibytePy(ctx) {
  const name = "multibyte.py";
  const uri = "file:///fixtures/multibyte.py";
  // Line 1: multibyte comment shifts all later byte offsets vs utf-16.
  // Line 3: 🚀 (4B utf-8 / 2 utf-16 units), → (3B/1), é (2B/1) BEFORE the
  // error token — the exact off-by-N killer §9.2/§9.12 hunt.
  const text = `# módulo → prueba
def rocket():
    s = "🚀→é" + undefined_name
    return s
`;
  const bytes = Buffer.from(text, "utf8");
  writeFileSync(join(ctx.fixDir, name), bytes);

  const rocketStart = text.indexOf("def rocket");
  const rocketSpan = [utf8ByteOffset(text, rocketStart), bytes.length];
  const errIdx = text.indexOf("undefined_name");
  const errStart = utf8ByteOffset(text, errIdx);

  ctx.schemaNodes[name] = [
    makeNode({
      lang: "python", kind: "function", name: "rocket", file: uri, span: rocketSpan,
      fill: { status: "green", source: "stub-pyright@1.1 typecheck verdict (stale)" },
      outline: { status: "green", worstOf: ["green"] }, origin: "checked",
    }),
  ];
  ctx.fixtureMeta[name] = {
    uri, languageId: "python", lang: "python", bomBytes: 0, eol: "LF",
    byteLength: bytes.length, sha256: sha256(bytes),
    diagnosticRules: [
      {
        pattern: "undefined_name", severity: 1,
        message: '"undefined_name" is not defined',
        source: "stub-pyright", code: "reportUndefinedVariable",
      },
    ],
    symbols: [{ name: "rocket", kind: 12, byteStart: rocketSpan[0], byteEnd: rocketSpan[1] }],
    definitions: {},
    expected: {
      errorByteStart: errStart,
      errorByteEnd: errStart + utf8len("undefined_name"),
      // Independent utf-16 coordinates for the same token (line 2, 0-based):
      errorLine0: 2,
      errorCharUtf16: text.split("\n")[2].indexOf("undefined_name"),
    },
  };
}

// ─── whitespace.py (BOM + CRLF + trailing ws + tab/space mix) ────────────────
export function genWhitespacePy(ctx) {
  const name = "whitespace.py";
  const uri = "file:///fixtures/whitespace.py";
  const body =
    "def spaced():  \n" + //           trailing spaces, LF
    "    return 1  \r\n" + //          trailing spaces, CRLF line
    "\t# tab-indented comment\n" + //  tab indent
    "x = 1\n";
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
  writeFileSync(join(ctx.fixDir, name), bytes);

  const bom = 3;
  const spacedStart = body.indexOf("def spaced");
  const spacedEnd = body.indexOf("\t# tab");
  ctx.schemaNodes[name] = [
    makeNode({
      lang: "python", kind: "function", name: "spaced", file: uri,
      // Absolute file offsets INCLUDE the BOM bytes (transcript D4).
      span: [bom + utf8ByteOffset(body, spacedStart), bom + utf8ByteOffset(body, spacedEnd)],
      fill: { status: "unknown", source: "" }, outline: null, origin: "checked",
    }),
  ];
  ctx.fixtureMeta[name] = {
    uri, languageId: "python", lang: "python", bomBytes: bom, eol: "LF",
    byteLength: bytes.length, sha256: sha256(bytes),
    diagnosticRules: [], symbols: [], definitions: {}, expected: {},
  };
}

// ─── nested.py (class containing methods — innermost-wins) ──────────────────
export function genNestedPy(ctx) {
  const name = "nested.py";
  const uri = "file:///fixtures/nested.py";
  const text = `class Shape:
    def area(self):
        return 0

    def name(self):
        return "shape"
`;
  const bytes = Buffer.from(text, "utf8");
  writeFileSync(join(ctx.fixDir, name), bytes);

  const classSpan = [0, bytes.length];
  const areaSpan = blockSpan(text, "    def area", "\n\n");
  const nameStart = text.indexOf("    def name");
  const nameSpan = [utf8ByteOffset(text, nameStart), bytes.length];

  const returnShape = text.indexOf('return "shape"');
  ctx.schemaNodes[name] = [
    makeNode({
      lang: "python", kind: "class", name: "Shape", file: uri, span: classSpan,
      fill: { status: "green", source: "stub-pyright@1.1 typecheck verdict" },
      outline: { status: "amber", worstOf: ["green", "amber"] }, origin: "checked",
    }),
    makeNode({
      lang: "python", kind: "function", name: "Shape.area", file: uri, span: areaSpan,
      fill: { status: "green", source: "stub-pyright@1.1 typecheck verdict" },
      outline: { status: "green", worstOf: ["green"] }, origin: "checked",
    }),
    makeNode({
      lang: "python", kind: "function", name: "Shape.name", file: uri, span: nameSpan,
      fill: { status: "unknown", source: "" }, outline: null, origin: "checked",
    }),
  ];
  ctx.fixtureMeta[name] = {
    uri, languageId: "python", lang: "python", bomBytes: 0, eol: "LF",
    byteLength: bytes.length, sha256: sha256(bytes),
    diagnosticRules: [],
    symbols: [
      {
        name: "Shape", kind: 5, byteStart: classSpan[0], byteEnd: classSpan[1],
        children: [
          { name: "area", kind: 6, byteStart: areaSpan[0], byteEnd: areaSpan[1] },
          { name: "name", kind: 6, byteStart: nameSpan[0], byteEnd: nameSpan[1] },
          // A symbol with NO matching schema node — §9.11's logged disagreement.
          {
            name: "__str__", kind: 6,
            byteStart: utf8ByteOffset(text, returnShape),
            byteEnd: utf8ByteOffset(text, returnShape) + utf8len('return "shape"'),
          },
        ],
      },
    ],
    definitions: {},
    expected: {},
  };
}

// ─── tier-g.tex (grammar-floor tier: green must be BLOCKED) ─────────────────
export function genTierGTex(ctx) {
  const name = "tier-g.tex";
  const uri = "file:///fixtures/tier-g.tex";
  const text = `\\section{Grammar floor fixture}
Just text, no compiler underneath.
`;
  const bytes = Buffer.from(text, "utf8");
  writeFileSync(join(ctx.fixDir, name), bytes);

  ctx.schemaNodes[name] = [
    makeNode({
      lang: "latex", kind: "section", name: "Grammar floor fixture", file: uri,
      span: [0, bytes.length],
      // Schema CLAIMS green — but tier G can never back it. §9.4 asserts the
      // guard downgrades this to unknown and green.blocked fires.
      fill: { status: "green", source: "schema-claims-green-without-compiler" },
      outline: null, origin: "checked",
    }),
  ];
  ctx.fixtureMeta[name] = {
    uri, languageId: "latex", lang: "latex", bomBytes: 0, eol: "LF",
    byteLength: bytes.length, sha256: sha256(bytes),
    diagnosticRules: [], symbols: [], definitions: {}, expected: {},
  };
}
