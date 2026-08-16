"""Demo entry point: one full pipeline pass over the golden fixture, with the
entire diagnostic surface written to out/ for probing.

Usage (from graph-model/):
    python run_pipeline.py [inputPath rootsPath]
"""
import json
import sys
from pathlib import Path

CELL_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(CELL_ROOT))

from src.cell import GraphModelCell  # noqa: E402


def main():
    if len(sys.argv) not in (1, 3):
        raise SystemExit("usage: python run_pipeline.py [inputPath rootsPath] "
                         "(both or neither — a lone argument would silently pair "
                         "with the wrong roots)")
    input_path = sys.argv[1] if len(sys.argv) == 3 else "fixtures/sample.py"
    roots_path = sys.argv[2] if len(sys.argv) == 3 else "fixtures/roots.json"
    cell = GraphModelCell(CELL_ROOT)
    result = cell.run(input_path, roots_path)

    out = CELL_ROOT / "out"
    out.mkdir(exist_ok=True)
    (out / "probes.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False) for e in cell.history()) + "\n",
        encoding="utf-8")
    (out / "graph.json").write_text(
        json.dumps(result["graph"], indent=2), encoding="utf-8")
    (out / "flat.json").write_text(
        json.dumps(result["projections"]["flat"], indent=2), encoding="utf-8")
    (out / "text.txt").write_bytes(result["projections"]["text"]["bytes"].encode("utf-8"))
    (out / "t3result.json").write_text(
        json.dumps(result["t3Result"], indent=2), encoding="utf-8")
    (out / "dump.json").write_text(
        json.dumps(cell.dump(), indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "probe_catalog.json").write_text(
        json.dumps(cell.probeCatalog(), indent=2), encoding="utf-8")

    history = cell.history()
    verdict = next(e for e in history
                   if e["probeId"] == "graph-model.roundtrip.verdict")["payload"]
    summary = {
        "events": len(history),
        "catalogLeads": len(cell.probeCatalog()),
        "nodes": len(result["graph"]["nodes"]),
        "edges": len(result["graph"]["edges"]),
        "leads": len(result["graph"]["leads"]),
        "reachable": result["t3Result"]["reachable"],
        "unused": result["t3Result"]["unused"],
        "crosscheckAgrees": result["t3Result"]["crosscheck"]["agrees"],
        "roundtripVerdict": verdict,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
