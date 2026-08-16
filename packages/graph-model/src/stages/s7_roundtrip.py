"""S7 roundtrip: the C1 fixpoint gate — text -> model -> text must equal the
source BYTE-FOR-BYTE.  Compared by length, then hash, then the first
divergence is located (index + both bytes + context) and the FULL byte diff is
dumped (no truncation).  The pure (manifest, logical-file) re-ingest must
reproduce the same content-addressed ids (ids never depend on reprint bytes),
and a second round trip must change nothing (idempotence).  Failure is named:
c1-fixpoint-broken.
"""
from ..ids import ids_from_manifest, sha256_hex
from .s6_project import reprint_from_tiles, tile_spans

STAGE = "roundtrip"
CONTEXT_BYTES = 12


def first_divergence(src, rpt):
    """Index of the first differing byte, or None if identical."""
    for i in range(min(len(src), len(rpt))):
        if src[i] != rpt[i]:
            return i
    if len(src) != len(rpt):
        return min(len(src), len(rpt))
    return None


def run(cell, ctx, in_ref):
    bus = cell.bus
    src = ctx["source"]["text"].encode("utf-8")
    reprint_text = ctx["projections"]["text"]["bytes"]
    rpt = reprint_text.encode("utf-8")

    rp_ref = bus.emit("graph-model.roundtrip.reprint", STAGE, "value",
                      {"reprintBytes": reprint_text, "byteLen": len(rpt),
                       "sha256": sha256_hex(rpt)}, cause=in_ref)
    len_equal = len(src) == len(rpt)
    len_ref = bus.emit("graph-model.roundtrip.compare.len", STAGE, "decision",
                       {"sourceLen": len(src), "reprintLen": len(rpt),
                        "equal": len_equal}, cause=rp_ref)
    src_sha, rpt_sha = sha256_hex(src), sha256_hex(rpt)
    hash_equal = src_sha == rpt_sha
    hash_ref = bus.emit("graph-model.roundtrip.compare.hash", STAGE, "decision",
                        {"sourceSha256": src_sha, "reprintSha256": rpt_sha,
                         "equal": hash_equal}, cause=len_ref)

    div = first_divergence(src, rpt)
    if div is None:
        div_payload = {"index": None, "sourceByte": None, "reprintByte": None,
                       "contextBefore": None, "contextAfter": None}
    else:
        div_payload = {
            "index": div,
            "sourceByte": src[div] if div < len(src) else None,
            "reprintByte": rpt[div] if div < len(rpt) else None,
            "contextBefore": src[max(0, div - CONTEXT_BYTES):div].decode("utf-8", "replace"),
            "contextAfter": src[div:div + CONTEXT_BYTES].decode("utf-8", "replace"),
        }
    div_ref = bus.emit("graph-model.roundtrip.firstDivergence", STAGE, "value",
                       div_payload, cause=hash_ref)
    byte_diff = [{"index": i,
                  "src": src[i] if i < len(src) else None,
                  "got": rpt[i] if i < len(rpt) else None}
                 for i in range(max(len(src), len(rpt)))
                 if i >= len(src) or i >= len(rpt) or src[i] != rpt[i]]
    bus.emit("graph-model.roundtrip.diff", STAGE, "value",
             {"byteDiff": byte_diff, "count": len(byte_diff)}, cause=div_ref)

    # id stability: the pure re-ingest — recompute the content-addressed ids
    # implied by (manifest, logical file); ids never depend on reprint bytes
    manifest = ctx["ingest"]["manifest"]
    original_ids = sorted(n["id"] for n in ctx["nodes"])
    reingested_ids = ids_from_manifest(manifest)
    ids_equal = original_ids == reingested_ids
    ids_ref = bus.emit("graph-model.roundtrip.reingest.idsMatch", STAGE, "decision",
                       {"originalIds": original_ids, "reingestedIds": reingested_ids,
                        "equal": ids_equal}, cause=hash_ref)

    # stronger fixpoint: model -> text -> model -> text stabilizes
    reprint2 = reprint_from_tiles(reprint_text, tile_spans(ctx["ingest"]))
    ids2 = ids_from_manifest(manifest)
    model_stable = (reprint2 == reprint_text) and (ids2 == reingested_ids)
    bus.emit("graph-model.roundtrip.fixpoint2", STAGE, "value",
             {"modelStable": model_stable,
              "note": "model->text->model->text stabilizes"}, cause=ids_ref)

    passed = bool(len_equal and hash_equal and div is None and ids_equal and model_stable)
    verdict = {"pass": passed,
               "failureClass": None if passed else "c1-fixpoint-broken"}
    bus.emit("graph-model.roundtrip.verdict", STAGE, "decision", verdict, cause=ids_ref)

    ctx["roundtrip"] = {
        "verdict": verdict,
        "firstDivergence": div_payload,
        "byteDiffCount": len(byte_diff),
        "idsMatch": ids_equal,
        "fixpoint2": model_stable,
        "sourceSha256": src_sha,
        "reprintSha256": rpt_sha,
    }
