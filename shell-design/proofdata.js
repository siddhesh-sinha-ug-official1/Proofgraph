// ProofGraph demo corpus — shared by every shell variation. Sets window.PGDATA.
// Verdict COLORS + HATCH are canonical (packages/graph-view/src/verdict.ts) — never restyled.
(function () {
  var COLORS = { green: "#2E7D32", amber: "#F9A825", red: "#C62828", blue: "#1565C0", unknown: "#9E9E9E" };
  var HATCH = "repeating-linear-gradient(45deg,#9E9E9E,#9E9E9E 6px,#bdbdbd 6px,#bdbdbd 12px)";

  var SRC = {
    "moatpkg/core.py": '"""moatpkg.core \u2014 manifest parsing + graph assembly (S1 feed)."""\nfrom __future__ import annotations\n\nfrom dataclasses import dataclass, field\nfrom typing import Optional\n\nimport moatlib.legacy\nfrom moatpkg.util import load_json, sha256_file\n\nSCHEMA_VERSION = "v5.2"\n\n@dataclass(frozen=True)\nclass Manifest:\n    root: str\n    entries: tuple = field(default_factory=tuple)\n\ndef parse_manifest(path: str) -> Manifest:\n    raw = load_json(path)\n    if raw.get("schema") == SCHEMA_VERSION:\n        entries = tuple(raw["entries"])\n    return Manifest(root=raw["root"], entries=entries)\n\ndef validate_entry(entry: dict, strict: bool = True) -> bool:\n    digest = sha256_file(entry.get("path"))\n    return digest is not None and entry.get("kind") in KINDS\n\ndef build_graph(m: Manifest) -> dict:\n    nodes = [e for e in m.entries if validate_entry(e)]\n    return {"schema": SCHEMA_VERSION, "nodes": nodes}',
    "moatpkg/api.py": '"""moatpkg.api \u2014 workspace scan + envelope emission (hub-facing)."""\nfrom typing import Iterator\n\nfrom moatpkg.core import Manifest, build_graph, parse_manifest\nfrom moatpkg.util import walk_tree\n\ndef scan_workspace(root: str) -> list[Manifest]:\n    found = [parse_manifest(p) for p in walk_tree(root) if p.endswith(".json")]\n    return found or []\n\ndef resolve_imports(ms: list[Manifest]) -> dict:\n    table = moatlib.legacy.load(ms)\n    return {"resolved": table, "leads": ["pyright.session", "moatlib.legacy.load"]}\n\ndef emit_envelope(ms: list[Manifest]) -> bytes:\n    return build_graph(ms[0]) if ms else b"{}"',
    "moatpkg/util.py": '"""moatpkg.util \u2014 hashing + fs helpers (path-jailed by the hub)."""\nimport hashlib, json, os\n\ndef load_json(path: str) -> dict:\n    with open(path, "rb") as f:\n        return json.loads(f.read())\n\ndef sha256_file(path: str) -> str | None:\n    if not os.path.exists(path):\n        return None\n    return hashlib.sha256(open(path, "rb").read()).hexdigest()\n\ndef walk_tree(root: str):\n    yield from (os.path.join(d, f) for d, _, fs in os.walk(root) for f in fs)',
    "moatpkg/__init__.py": '"""moatpkg \u2014 probe-maximal demo corpus for the assembled organism."""\n__all__ = ["core", "api", "util"]',
    "tests/test_core.py": '"""tests.test_core \u2014 roundtrip: parse \u2192 build."""\nfrom moatpkg.core import build_graph, parse_manifest\n\ndef test_roundtrip(tmp_path):\n    m = parse_manifest(str(tmp_path / "manifest.json"))\n    g = build_graph(m)\n    assert g["schema"] == "v5.2"',
    "tests/test_api.py": '"""tests.test_api \u2014 scan + resolve stay honest."""\nfrom moatpkg.api import resolve_imports, scan_workspace\n\ndef test_scan(tmp_path):\n    ms = scan_workspace(str(tmp_path))\n    assert resolve_imports(ms)["leads"] != []',
    "examples/mini/demo.py": '"""examples.mini \u2014 smallest end-to-end corpus."""\nfrom moatpkg.api import emit_envelope, scan_workspace\n\ndef main() -> None:\n    print(emit_envelope(scan_workspace(".")))',
    "tools/gen/gen_schema.py": '"""tools.gen \u2014 regenerate packages/schema/gen (never hand-edited)."""\nfrom moatpkg.util import load_json\n\ndef emit(path: str) -> None:\n    print(load_json(path)["schemaVersion"])',
    "pyproject.toml": '[project]\nname = "moatpkg"\nversion = "0.4.1"\nrequires-python = ">=3.11"\n\n[tool.moat]\ndeclared-roots = ["moatpkg", "tests"]',
    "pyrightconfig.json": '{\n  "typeCheckingMode": "strict",\n  "reportMissingImports": "warning",\n  "include": ["moatpkg", "tests"]\n}',
    "README.md": "# moatpkg \u2014 demo corpus\nSix cells, three membranes: the hub serves /graph,\n/analysis and the workspace fs; the shell never\ntouches disk. Run: python hub/serve_app.py (8477)."
  };

  // tiny python-ish tokenizer → [[type,text],...] per line. Types: S str, C comment, K kw, A deco, P self, D num, F call, X plain
  var RE = /("(?:[^"\\]*)"|'(?:[^'\\]*)')|(@\w+)|(\b(?:from|import|def|class|return|if|elif|else|for|in|not|None|True|False|with|as|try|except|raise|lambda|yield|is|and|or|assert|print)\b)|(\bself\b)|(\b\d[\w.]*\b)|([A-Za-z_]\w*(?=\())|([A-Za-z_]\w*)|(\s+|[^\sA-Za-z_]+)/g;
  function tokLine(line) {
    var out = [], hash = line.indexOf("#");
    var code = hash >= 0 ? line.slice(0, hash) : line;
    var m; RE.lastIndex = 0;
    while ((m = RE.exec(code)) !== null) {
      var t = m[1] ? "S" : m[2] ? "A" : m[3] ? "K" : m[4] ? "P" : m[5] ? "D" : m[6] ? "F" : "X";
      var last = out[out.length - 1];
      if (last && last[0] === t) last[1] += m[0]; else out.push([t, m[0]]);
    }
    if (hash >= 0) out.push(["C", line.slice(hash)]);
    if (out.length === 0) out.push(["X", " "]);
    return out;
  }
  var CODE = {};
  Object.keys(SRC).forEach(function (p) { CODE[p] = SRC[p].split("\n").map(tokLine); });

  var TREE = [
    { n: "moatpkg", c: [{ n: "__init__.py" }, { n: "api.py" }, { n: "core.py" }, { n: "util.py" }] },
    { n: "tests", c: [{ n: "test_api.py" }, { n: "test_core.py" }] },
    { n: "examples", c: [{ n: "mini", c: [{ n: "demo.py" }] }] },
    { n: "tools", c: [{ n: "gen", c: [{ n: "gen_schema.py" }] }] },
    { n: "pyproject.toml" }, { n: "pyrightconfig.json" }, { n: "README.md" }
  ];
  var EXTC = { py: ["py", "rgba(83,141,213,.22)", "#6A9BF5"], toml: ["tm", "rgba(190,145,60,.2)", "#C99A3C"], json: ["{}", "rgba(160,160,90,.2)", "#B0A559"], md: ["md", "rgba(120,180,140,.2)", "#7CB98F"] };

  // nodes: id,label,kind,file,line,fill,outline(null ok),worstOf, x,y,w
  var N = [
    ["moatpkg.util.load_json", "load_json", "fn", "moatpkg/util.py", 4, "green", "green", ["green"], 40, 18, 150],
    ["moatpkg.core.Manifest", "Manifest", "class", "moatpkg/core.py", 13, "blue", "green", ["green", "green"], 280, 18, 170],
    ["moatpkg.core.SCHEMA_VERSION", "SCHEMA_VERSION", "const", "moatpkg/core.py", 10, "blue", null, [], 490, 18, 200],
    ["moatpkg.util.sha256_file", "sha256_file", "fn", "moatpkg/util.py", 8, "green", null, [], 730, 18, 160],
    ["moatpkg.core.parse_manifest", "parse_manifest", "fn", "moatpkg/core.py", 17, "green", "green", ["green", "green"], 150, 124, 180],
    ["moatpkg.core.validate_entry", "validate_entry", "fn", "moatpkg/core.py", 23, "green", "amber", ["amber", "green"], 400, 124, 180],
    ["moatpkg.util.walk_tree", "walk_tree", "fn", "moatpkg/util.py", 13, "green", "green", ["green"], 660, 124, 150],
    ["moatpkg.core.build_graph", "build_graph", "fn", "moatpkg/core.py", 27, "green", "green", ["green", "green", "green"], 150, 230, 170],
    ["moatpkg.api.scan_workspace", "scan_workspace", "fn", "moatpkg/api.py", 7, "amber", "amber", ["amber", "amber", "green"], 390, 230, 190],
    ["moatpkg.api.resolve_imports", "resolve_imports", "fn", "moatpkg/api.py", 11, "red", "red", ["red", "amber"], 630, 336, 190],
    ["moatpkg.api.emit_envelope", "emit_envelope", "fn", "moatpkg/api.py", 15, "green", "red", ["red", "green", "green"], 260, 336, 180],
    ["tests.test_core.test_roundtrip", "test_roundtrip", "fn", "tests/test_core.py", 4, "unknown", "unknown", ["unknown"], 30, 336, 200],
    ["tests.test_api.test_scan", "test_scan", "fn", "tests/test_api.py", 4, "unknown", null, [], 470, 442, 170],
    ["examples.mini.demo.main", "demo.main", "fn", "examples/mini/demo.py", 4, "amber", "amber", ["amber"], 260, 442, 190]
  ];
  var EDGES = [[0, 4], [1, 4], [2, 4], [1, 5], [3, 5], [4, 7], [5, 7], [3, 7], [4, 8], [6, 8], [7, 10], [8, 10], [8, 9], [7, 11], [4, 11], [8, 12], [9, 12], [10, 13]];
  var GHOSTS = [
    { id: "lead:pyright.session", s: "pyright.session", x: 660, y: 452, w: 190 },
    { id: "lead:moatlib.legacy.load", s: "moatlib.legacy.load", x: 660, y: 532, w: 200 }
  ];
  var LEADS = [[9, 0], [9, 1], [4, 1]]; // node idx -> ghost idx

  var NODES = N.map(function (a) {
    var fill = a[5], outline = a[6];
    return {
      id: a[0], s: a[1], kind: a[2], file: a[3], line: a[4], fill: fill, outline: outline, worst: a[7],
      x: a[8], y: a[9], w: a[10],
      bg: fill === "unknown" ? HATCH : COLORS[fill],
      tc: (fill === "amber" || fill === "unknown") ? "#1d1d1d" : "#fff",
      ring: outline === null ? "2px dashed #9E9E9E" : "2.5px solid " + COLORS[outline],
      meta: a[2] + " \u00b7 " + a[3].split("/").pop() + ":" + a[4],
      tip: a[0] + "\nfill " + fill + (fill === "unknown" ? " (unknown \u2260 green \u2014 hatched)" : "") +
        " \u00b7 outline " + (outline === null ? "null \u2192 not-yet-computed (grey, never green)" : outline +
          (a[7].length > 1 ? " \u2190 worstOf " + a[7].join(" > ") : ""))
    };
  });
  function cx(n) { return n.x + n.w / 2; }
  function seg(x1, y1, x2, y2) { return "M" + x1 + " " + y1 + " C " + x1 + " " + (y1 + 44) + ", " + x2 + " " + (y2 - 44) + ", " + x2 + " " + y2 + " "; }
  var edgeD = "", leadD = "", SELD = {};
  NODES.forEach(function (n) { SELD[n.id] = ""; });
  EDGES.forEach(function (e) {
    var a = NODES[e[0]], b = NODES[e[1]];
    var d = seg(cx(a), a.y + 46, cx(b), b.y);
    edgeD += d; SELD[a.id] += d; SELD[b.id] += d;
  });
  LEADS.forEach(function (l) {
    var a = NODES[l[0]], g = GHOSTS[l[1]];
    var d = seg(cx(a), a.y + 46, g.x + g.w / 2, g.y);
    leadD += d; SELD[a.id] += d;
  });

  var DIAGS = [
    { sev: "error", f: "moatpkg/core.py", l: 24, m: 'Argument of type "str | None" cannot be assigned to parameter "path" of type "str"', rule: "reportArgumentType", v: 3 },
    { sev: "error", f: "moatpkg/core.py", l: 25, m: '"KINDS" is not defined', rule: "reportUndefinedVariable", v: 3 },
    { sev: "warning", f: "moatpkg/core.py", l: 21, m: '"entries" is possibly unbound', rule: "reportPossiblyUnbound", v: 3 },
    { sev: "warning", f: "moatpkg/core.py", l: 7, m: 'Import "moatlib.legacy" could not be resolved', rule: "reportMissingImports", v: 3 },
    { sev: "hint", f: "moatpkg/api.py", l: 2, m: '"Iterator" is not accessed', rule: "reportUnusedImport", v: 1 }
  ];
  var PINS = [
    ["hub", "graph.serve.bytes", '{"bytes":48213,"sha256":"3f9c2ab4","gate":"three-way serializer-edge-drop"}'],
    ["hub", "analysis.serve.applied", '{"verdicts":11,"unverdicted":3,"pendingIsHonest":true}'],
    ["graph-view", "verdict.output", '{"paints":14,"counts":{"green":7,"amber":2,"red":1,"blue":2,"unknown":2}}'],
    ["graph-view", "verdict.fill.unknownGuard", '{"nodeId":"tests.test_core.test_roundtrip","wouldBeGreen":false,"reason":"unknown \u2260 green"}'],
    ["graph-view", "cap.check", '{"maxNodes":500,"nodes":14,"capped":false}'],
    ["editor-shell", "editor.lsp.in.diagnostics", '{"uri":"moatpkg/core.py","count":4,"version":3,"transport":"hub-lsp-ws"}'],
    ["app-shell", "shell.file.open", '{"relPath":"moatpkg/core.py","source":"hub-fs","sha256":"91c4d0e2"}'],
    ["app-shell", "shell.menu.action", '{"menu":"analysis","item":"run-analyze"}'],
    ["app-shell", "shell.graph.zoom-to-fit", '{"note":"fitView on mount \u2014 the wall cell survives"}'],
    ["app-shell", "shell.save.ok", '{"relPath":"moatpkg/core.py","note":"PUT /fs/file (path-jailed hub-side)"}']
  ];
  var AI = {
    q: "why is api.resolve_imports red?",
    a: "resolve_imports fails its own check \u2014 pyright reports reportArgumentType at core.py:24, which flows through validate_entry \u2192 scan_workspace into it \u2014 and its outline is red by worst-case-wins over [red, amber]. Two of its call targets are unresolved cross-module LEADS (Pyright: none): pyright.session and moatlib.legacy.load. Switch Analysis \u203a Pyright: live and re-analyze to chase them.",
    ctx: ["moatpkg.api.resolve_imports", "core.py:24", "lead: moatlib.legacy.load"]
  };
  var PLUGINS = [
    { n: "Pyright Bridge", d: "Live cross-module resolution over the hub LSP websocket", v: "5.2.0", dl: "412K", inst: 1, bundled: 1 },
    { n: "Theme Importer", d: "Map VS Code .json and JetBrains .icls themes onto shell tokens", v: "1.4.2", dl: "268K", inst: 1 },
    { n: "Lean4 Structure Extractor", d: "\u2200 theorem / lemma nodes from Lean sources", v: "0.9.1", dl: "96K" },
    { n: "Vim Mode", d: "Modal editing for the editor wall", v: "2.11.0", dl: "1.2M" },
    { n: "Graph Minimap", d: "Birds-eye inset for large verdict walls", v: "0.3.4", dl: "41K" },
    { n: "Moat Sync", d: "Push gap reports to GitHub issues", v: "1.0.7", dl: "58K" }
  ];
  var GAPS = [
    { n: "api.emit_envelope", d: "red ring", w: "red \u2190 [red, green, green]", ok: "consistent" },
    { n: "api.resolve_imports", d: "red ring", w: "red \u2190 [red, amber]", ok: "consistent" },
    { n: "core.validate_entry", d: "amber ring", w: "amber \u2190 [amber, green]", ok: "consistent" },
    { n: "tests.test_core.test_roundtrip", d: "unknown", w: "unknown \u2260 green (hard guard)", ok: "guarded" },
    { n: "SCHEMA_VERSION \u00b7 sha256_file \u00b7 test_scan", d: "outline null", w: "not-yet-computed \u2014 grey, never green", ok: "pending" }
  ];
  var ROOTS = [
    { p: "moatpkg", note: "4 files \u00b7 declared", on: 1 },
    { p: "tests", note: "2 files \u00b7 declared", on: 1 },
    { p: "examples/mini", note: "1 file", on: 0 },
    { p: "tools/gen", note: "generator \u2014 usually excluded", on: 0 }
  ];
  window.PGDATA = {
    COLORS: COLORS, HATCH: HATCH, CODE: CODE, TREE: TREE, EXTC: EXTC,
    NODES: NODES, GHOSTS: GHOSTS, edgeD: edgeD, leadD: leadD, SELD: SELD, GW: 920, GH: 620,
    DIAGS: DIAGS, PINS: PINS, AI: AI, PLUGINS: PLUGINS, GAPS: GAPS, ROOTS: ROOTS,
    RECENTS: [{ k: "folder", p: "moatpkg" }, { k: "file", p: "moatpkg/core.py" }, { k: "folder", p: "examples/mini" }],
    HEALTH: { v: "v5.2", hash: "3f9c2ab41e77d05c", walls: [["graph-view", "5.4.1"], ["editor-shell", "5.2.0"], ["capability-layer", "3.1.0"], ["structure-extractor", "2.6.3"]] },
    counts: { nodes: 14, edges: 18, leads: 3 },
    WORST_ORDER: "red > amber > unknown > blue > green"
  };
})();
