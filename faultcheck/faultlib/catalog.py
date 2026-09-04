"""catalog — the SIX faults (worklist item 4.1 a–e + wave-3 f), data only.

Faults a–e carved VERBATIM from faultcheck/run_faults.py (SUB200
restructure, wave 2); fault f (line-gate ceiling) added with the wave-3
line-gate.  [adversarial claim-audit 2026-08-03: header said "FIVE faults
(a–e)" after f landed — corrected.]
"""
from __future__ import annotations

import os
from pathlib import Path

from .harness import NM_APP, NM_ESHELL, NM_GVIEW, PY, append, patch, plant

def _npx(*args: str) -> list[str]:
    if os.name == "nt":
        return ["cmd", "/c", "npx", *args]
    return ["npx", *args]

# ── the six faults (a–e core guards + f line-gate) ───────────────────────────
FAULTS = [
    {
        "key": "a-verdict-integrity",
        "guarantee": "green ONLY from a real checker (unbacked-green guard)",
        "defect": "lean_dock green branch mints fill green with source=\"\" "
                  "(checker evidence stripped at the source)",
        # [anchor re-pointed, post-SUB200] the green branch moved
        # lean_dock.py -> lean_ct_fill.py in the wave-1 facade split; the old
        # 680-line dock kept only the facade. Indentation re-measured against
        # the new module (8/12-space, was 16/20 inside the monolith).
        "inject": lambda root: patch(
            root / "packages" / "structure-extractor" / "extractor" / "docks" / "lean_ct_fill.py",
            '''        if verdict == "green":
            src_str = (f"lean-kernel:v{ver}:kernelAccepted "
                       f"decl={d['name']} run={run_ref(sha)}")''',
            '''        if verdict == "green":
            src_str = ""  # FAULT-INJECTED (scratch only): green WITHOUT checker evidence'''),
        "cmd": [PY, os.path.join("selftest", "run_all.py"), "--fast"],
        "cwd": Path("packages") / "structure-extractor",
        "junctions": [],
        "signatures": ["unbacked-green", "UnbackedGreenError"],
        "timeout": 1500,
    },
    {
        "key": "b-py-ts-id-consistency",
        "guarantee": "Py<->TS content-addressed ID identity across the hub seam",
        "defect": "hub /graph serve path flips ONE byte of the first node id "
                  "AFTER the hub-side verify (tampering-serializer stand-in)",
        # [anchor re-pointed, Wave-D E4] the tail of render_graph_payload
        # gained a cache-store line (self._graph_payload_cache = …) between
        # `counts[key] = len(want)` and `return payload, counts`. The
        # injection must tamper the payload BEFORE it lands in the cache so
        # subsequent /graph hits (from the same cached identity) remain
        # tampered too — the v4 test catches on first fetch either way.
        "inject": lambda root: patch(
            root / "hub" / "server.py",
            '''            counts[key] = len(want)
        self._graph_payload_cache = (cache_key, payload, dict(counts))
        return payload, counts''',
            '''            counts[key] = len(want)
        # FAULT-INJECTED (scratch only): flip one byte of the first node id in
        # the SERVED payload after the hub-side verify — the V4 client gate
        # (fetchGraphVerified three-way equality) must catch it. The tampered
        # payload also lands in the cache so subsequent hits are consistent.
        served_f = json.loads(payload.decode("utf-8"))
        nid_f = served_f["nodes"][0]["id"]
        served_f["nodes"][0]["id"] = nid_f[:-1] + ("0" if nid_f[-1] != "0" else "1")
        payload = hub_pipeline.canonical_json_bytes(served_f)
        self._graph_payload_cache = (cache_key, payload, dict(counts))
        return payload, counts'''),
        "cmd": _npx("vitest", "run", "--no-cache",
                "test/v4.serve.test.tsx"),
        "cwd": Path("app"),
        "junctions": [NM_APP, NM_GVIEW],
        "signatures": ["serializer-edge-drop"],
        "timeout": 1500,
    },
    {
        "key": "c-leads-edges-separation",
        "guarantee": "resolved=false is a LEAD, never carried in edges[]",
        "defect": "pipeline envelope partition regressed: unresolved rows "
                  "ride edges[] (the resolved filter dropped)",
        "inject": lambda root: patch(
            root / "packages" / "structure-extractor" / "extractor" / "pipeline.py",
            '''            "edges": [e.to_dict() for e in edges if e.resolved],''',
            '''            "edges": [e.to_dict() for e in edges],  # FAULT-INJECTED (scratch only): leads ride edges[]'''),
        "cmd": [PY, os.path.join("vessels", "test_v3_extractor_to_model.py")],
        "cwd": Path("."),
        "junctions": [],
        "signatures": ["lead-in-edges", "resolved=false is a lead",
                       "graphjson-nonconformant"],
        "timeout": 900,
    },
    {
        "key": "d-provenance-completeness",
        "guarantee": "every graph element carries complete provenance "
                     "(assert_no_holes is BUILD-FAILING)",
        "defect": "outerwall provenance builder stops recording the nodes' "
                  "\"tier\" field",
        "inject": lambda root: patch(
            root / "outerwall" / "provenance.py",
            '''        nodes[n["id"]] = {
            "cell": CELL_EXTRACTOR,
            "tier": p.get("tier"),''',
            '''        nodes[n["id"]] = {
            "cell": CELL_EXTRACTOR,
            # FAULT-INJECTED (scratch only): "tier" no longer recorded''')
        ,
        "cmd": [PY, os.path.join("outerwall", "test_outerwall.py")],
        "cwd": Path("."),
        "junctions": [],
        "signatures": ["provenance-hole", "ProvenanceHole", "provenance field"],
        "timeout": 1500,
    },
    {
        "key": "e-bundle-credential-check",
        "guarantee": "no key-shaped material ever reaches the browser bundle",
        "defect": "cell-6's insecure dev masterSecret literal planted in "
                  "app/src/main.tsx (a global side effect the bundler keeps)",
        "inject": lambda root: append(
            root / "app" / "src" / "main.tsx",
            '\n// FAULT-INJECTED (scratch only): key material planted in app source —\n'
            '// the P3 build gate\'s dist byte-scan must fail.\n'
            '(globalThis as unknown as Record<string, unknown>).__faultInjectedSecret =\n'
            '  "byok-arena-dev-master-secret-CHANGE-ME";\n'),
        "cmd": _npx("vitest", "run", "--no-cache",
                "test/p3.build.gate.test.ts"),
        "cwd": Path("app"),
        "junctions": [NM_APP, NM_GVIEW, NM_ESHELL],
        "signatures": ["key-shaped material reached the browser bundle",
                       "cell-6 insecure dev masterSecret"],
        "timeout": 2400,
    },
    {
        "key": "f-line-gate-ceiling",
        "guarantee": "the sub-200 line ceiling is an ENFORCED invariant "
                     "(linegate.py fails on any non-exempt source file >200)",
        "defect": "a 250-line non-exempt source file planted in the tree "
                  "(faultcheck/planted_ceiling_offender.py)",
        "inject": lambda root: plant(
            root / "faultcheck" / "planted_ceiling_offender.py", 250),
        "cmd": [PY, os.path.join("linegate.py")],
        "cwd": Path("."),
        "junctions": [],
        "signatures": ["line-gate-violation",
                       "faultcheck/planted_ceiling_offender.py"],
        "timeout": 300,
    },
]
