/**
 * Fixture sections: clean.py + type-error.py (SUB200 restructure: split from
 * ../gen-fixture-nodes.mjs, content byte-identical). Each section writes its
 * byte-exact source file into ctx.fixDir and records nodes/meta on ctx.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { blockSpan, makeNode, sha256, utf8ByteOffset, utf8len } from "./helpers.mjs";

// ─── clean.py ────────────────────────────────────────────────────────────────
export function genCleanPy(ctx) {
  const name = "clean.py";
  const uri = "file:///fixtures/clean.py";
  const text = `def add(a, b):
    return a + b


def double(x):
    return add(x, x)


def unused_helper(y):
    return y * 2
`;
  const bytes = Buffer.from(text, "utf8");
  writeFileSync(join(ctx.fixDir, name), bytes);

  const addSpan = blockSpan(text, "def add", "\n\n\n");
  const doubleSpan = blockSpan(text, "def double", "\n\n\n");
  const unusedSpan = blockSpan(text, "def unused_helper", "\n\n\n");
  const nodes = [
    makeNode({
      lang: "python", kind: "module", name: "clean", file: uri, span: [0, bytes.length],
      fill: { status: "blue", source: "external: module trusted as given" },
      outline: null, origin: "given",
    }),
    makeNode({
      lang: "python", kind: "function", name: "add", file: uri, span: addSpan,
      signature: "def add(a, b)",
      fill: { status: "green", source: "stub-pyright@1.1 typecheck verdict" },
      outline: { status: "green", worstOf: ["green"] }, origin: "checked",
    }),
    makeNode({
      lang: "python", kind: "function", name: "double", file: uri, span: doubleSpan,
      signature: "def double(x)",
      fill: { status: "green", source: "stub-pyright@1.1 typecheck verdict" },
      outline: { status: "red", worstOf: ["green", "amber", "red"] }, origin: "assumed",
    }),
    makeNode({
      lang: "python", kind: "function", name: "unused_helper", file: uri, span: unusedSpan,
      signature: "def unused_helper(y)",
      fill: { status: "unknown", source: "" },
      outline: null, origin: "checked",
    }),
    // Foreign-file node: excluded from this file's index (multifile branch);
    // its id arriving on the bus must trigger recv.miss, never a wrong span.
    makeNode({
      lang: "python", kind: "function", name: "foreign_fn",
      file: "file:///fixtures/other.py", span: [0, 40],
      fill: { status: "unknown", source: "" }, outline: null, origin: "checked",
    }),
  ];
  ctx.schemaNodes[name] = nodes;
  ctx.fixtureMeta[name] = {
    uri, languageId: "python", lang: "python", bomBytes: 0, eol: "LF",
    byteLength: bytes.length, sha256: sha256(bytes),
    diagnosticRules: [],
    symbols: [
      { name: "add", kind: 12, byteStart: addSpan[0], byteEnd: addSpan[1] },
      { name: "double", kind: 12, byteStart: doubleSpan[0], byteEnd: doubleSpan[1] },
      { name: "unused_helper", kind: 12, byteStart: unusedSpan[0], byteEnd: unusedSpan[1] },
    ],
    definitions: (() => {
      // definition of `add` = the token inside "def add"
      const defAdd = text.indexOf("def add") + 4;
      return {
        add: { byteStart: utf8ByteOffset(text, defAdd), byteEnd: utf8ByteOffset(text, defAdd) + 3 },
      };
    })(),
    expected: {},
  };
}

// ─── type-error.py ───────────────────────────────────────────────────────────
export function genTypeErrorPy(ctx) {
  const name = "type-error.py";
  const uri = "file:///fixtures/type-error.py";
  const text = `def add(a, b):
    return a + b


def double(x):
    return add(x, x)


def broken(y):
    unused_var = 1
    return y + undefined_name
`;
  const bytes = Buffer.from(text, "utf8");
  writeFileSync(join(ctx.fixDir, name), bytes);

  const addSpan = blockSpan(text, "def add", "\n\n\n");
  const doubleSpan = blockSpan(text, "def double", "\n\n\n");
  const brokenSpan = blockSpan(text, "def broken", "\n\n\n");
  const errIdx = text.indexOf("undefined_name");
  const errStart = utf8ByteOffset(text, errIdx);
  const unusedIdx = text.indexOf("unused_var");

  ctx.schemaNodes[name] = [
    makeNode({
      lang: "python", kind: "function", name: "add", file: uri, span: addSpan,
      fill: { status: "green", source: "stub-pyright@1.1 typecheck verdict" },
      outline: { status: "green", worstOf: ["green"] }, origin: "checked",
    }),
    makeNode({
      lang: "python", kind: "function", name: "double", file: uri, span: doubleSpan,
      fill: { status: "green", source: "stub-pyright@1.1 typecheck verdict" },
      outline: null, origin: "checked",
    }),
    makeNode({
      // STALE schema green on a now-broken function: live diagnostics must
      // win the conflict downward (red), logged via editor.verdict.conflict.
      lang: "python", kind: "function", name: "broken", file: uri, span: brokenSpan,
      fill: { status: "green", source: "stub-pyright@1.1 typecheck verdict (stale)" },
      outline: null, origin: "checked",
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
        quickfix: true, relatedPattern: "def broken", relatedMessage: "in function broken",
      },
      {
        pattern: "unused_var", severity: 2,
        message: '"unused_var" is assigned but never used',
        source: "stub-pyright", code: "reportUnusedVariable", tags: [1],
      },
    ],
    symbols: [
      { name: "add", kind: 12, byteStart: addSpan[0], byteEnd: addSpan[1] },
      { name: "double", kind: 12, byteStart: doubleSpan[0], byteEnd: doubleSpan[1] },
      { name: "broken", kind: 12, byteStart: brokenSpan[0], byteEnd: brokenSpan[1] },
    ],
    definitions: (() => {
      const defAdd = text.indexOf("def add") + 4;
      return {
        add: { byteStart: utf8ByteOffset(text, defAdd), byteEnd: utf8ByteOffset(text, defAdd) + 3 },
      };
    })(),
    expected: {
      errorByteStart: errStart,
      errorByteEnd: errStart + utf8len("undefined_name"),
      warnByteStart: utf8ByteOffset(text, unusedIdx),
      warnByteEnd: utf8ByteOffset(text, unusedIdx) + utf8len("unused_var"),
    },
  };
}
