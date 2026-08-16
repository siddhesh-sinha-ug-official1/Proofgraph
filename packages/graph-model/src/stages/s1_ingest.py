"""S1 ingest: hand-written span records over raw source bytes (NOT a parser —
real extraction is Tree 3's job).

Captures trivia spans (inter-decl whitespace: the classic round-trip killer)
and runs the coverage precheck: decl + trivia spans must tile [0, byteLen)
exactly.  A gap here predicts an S7 round-trip failure.  Roots are DECLARED
in a fixture manifest, never inferred.
"""
import json

from ..ids import sha256_hex

STAGE = "ingest"


def coverage_check(spans, byte_len):
    """Do the given [byteStart,byteEnd) spans tile [0,byte_len) with no gap and
    no overlap?  Returns (coversFullRange, gaps, overlaps)."""
    ordered = sorted(spans, key=lambda s: (s["byteStart"], s["byteEnd"]))
    gaps, overlaps = [], []
    cursor = 0
    for s in ordered:
        if s["byteStart"] > cursor:
            gaps.append({"byteStart": cursor, "byteEnd": s["byteStart"]})
        elif s["byteStart"] < cursor:
            overlaps.append({"byteStart": s["byteStart"], "byteEnd": min(cursor, s["byteEnd"])})
        cursor = max(cursor, s["byteEnd"])
    if cursor < byte_len:
        gaps.append({"byteStart": cursor, "byteEnd": byte_len})
    covers = not gaps and not overlaps and cursor == byte_len
    return covers, gaps, overlaps


def run(cell, ctx, in_ref):
    bus = cell.bus
    cfg = ctx["config"]
    data = (cell.cell_root / cfg["inputPath"]).read_bytes()
    manifest = json.loads((cell.cell_root / cfg["manifestPath"]).read_text(encoding="utf-8"))
    roots = json.loads((cell.cell_root / cfg["rootsPath"]).read_text(encoding="utf-8"))

    # Logical file identity comes from the manifest, not the physical path —
    # this is what lets a reflowed byte presentation remain the SAME file.
    file = manifest["module"]["file"]
    byte_len = len(data)
    src_ref = bus.emit("graph-model.ingest.source.read", STAGE, "input",
                       {"file": file, "byteLen": byte_len,
                        "sha256": sha256_hex(data), "encoding": "utf-8"},
                       cause=in_ref)
    bus.emit("graph-model.ingest.roots.declared", STAGE, "value",
             {"roots": list(roots["roots"]), "source": roots["source"]},
             cause=src_ref)

    module_name = manifest["module"]["name"]
    module_rec = {"ordinal": 0, "kind": "module", "name": module_name,
                  "byteStart": 0, "byteEnd": byte_len,
                  "rawText": data.decode("utf-8"), "role": "container"}
    decl_refs = {}
    decl_refs["0"] = bus.emit("graph-model.ingest.decl.raw", STAGE, "node",
                              module_rec, cause=src_ref)

    decls = []
    for d in manifest["decls"]:
        rec = {"ordinal": d["ordinal"], "kind": d["kind"], "name": d["name"],
               "byteStart": d["byteStart"], "byteEnd": d["byteEnd"],
               "rawText": data[d["byteStart"]:d["byteEnd"]].decode("utf-8"),
               "role": "decl"}
        decls.append(rec)
        decl_refs[str(d["ordinal"])] = bus.emit(
            "graph-model.ingest.decl.raw", STAGE, "node", rec, cause=src_ref)

    refs = []
    for r in manifest.get("refs", []):
        rec = {"fromDecl": r["fromDecl"], "refName": r["refName"],
               "kind": r.get("kind", "references"), "atByte": r["atByte"]}
        refs.append(rec)
        bus.emit("graph-model.ingest.ref.raw", STAGE, "value", rec, cause=src_ref)

    trivia = []
    for t in manifest.get("trivia", []):
        rec = {"byteStart": t["byteStart"], "byteEnd": t["byteEnd"],
               "text": data[t["byteStart"]:t["byteEnd"]].decode("utf-8")}
        trivia.append(rec)
        bus.emit("graph-model.ingest.trivia.span", STAGE, "value", rec, cause=src_ref)

    tiling_spans = ([{"byteStart": d["byteStart"], "byteEnd": d["byteEnd"]} for d in decls]
                    + [{"byteStart": t["byteStart"], "byteEnd": t["byteEnd"]} for t in trivia])
    covers, gaps, overlaps = coverage_check(tiling_spans, byte_len)
    bus.emit("graph-model.ingest.coverage.precheck", STAGE, "decision",
             {"spans": sorted(tiling_spans, key=lambda s: s["byteStart"]),
              "coversFullRange": covers, "gaps": gaps, "overlaps": overlaps},
             cause=src_ref)
    # A failed precheck does NOT halt: it predicts an S7 c1-fixpoint-broken
    # verdict, which is the gate that actually judges it.

    bus.emit("graph-model.ingest.count", STAGE, "value",
             {"declCount": len(decls), "refCount": len(refs),
              "triviaCount": len(trivia)}, cause=src_ref)

    ctx["source"] = {"text": data.decode("utf-8"), "byteLen": byte_len,
                     "sha256": sha256_hex(data), "encoding": "utf-8"}
    ctx["roots"] = {"roots": list(roots["roots"]), "source": roots["source"]}
    ctx["ingest"] = {"module": module_rec, "decls": decls, "refs": refs,
                     "trivia": trivia, "manifest": manifest,
                     "coverage": {"coversFullRange": covers, "gaps": gaps,
                                  "overlaps": overlaps},
                     "counts": {"declCount": len(decls), "refCount": len(refs),
                                "triviaCount": len(trivia)},
                     "declProbeRefs": decl_refs}
