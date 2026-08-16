"""Golden-fixture generator (run once per intentional behavior change; the
diff is hand-reviewed before freezing — goldens are hand labels, not
self-fulfilling output).

    python selftest/tools/gen_goldens.py [--record-pyright]

--record-pyright also re-records the live pyright responses first.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))          # selftest/ (harness)
sys.path.insert(0, str(HERE.parents[1]))      # tree root (extractor)

from harness import (FIXTURES, RECORDING, RICH_ROOTS, edge_view, force_tier_g,
                     run_lang, run_rich, run_skeleton, snapshot_render)

GOLDEN = FIXTURES / "golden"
GOLDEN.mkdir(exist_ok=True)


def write(name: str, text: str) -> None:
    (GOLDEN / name).write_text(text, encoding="utf8")
    print(f"wrote {name}")


if __name__ == "__main__":
    if "--record-pyright" in sys.argv:
        from extractor.pipeline import ExtractorCell, PipelineConfig
        cell = ExtractorCell(PipelineConfig(
            roots=list(RICH_ROOTS), python_package="richpkg",
            pyright_mode="record", pyright_recording_path=RECORDING))
        cell.run(FIXTURES / "pyrich")
        print(f"re-recorded {RECORDING.name}")

    write("skeleton.edges.json",
          json.dumps(edge_view(run_skeleton()), indent=2, sort_keys=True) + "\n")
    rich = run_rich()
    write("rich.edges.json",
          json.dumps(edge_view(rich), indent=2, sort_keys=True) + "\n")
    write("rich.snapshot", snapshot_render(rich))
    for sub in ("lean", "latex", "typst"):
        # lean.edges.json is the tier-G REGRESSION golden (LEAN-DOCK round):
        # generated under a pinned G so the placeholder path stays byte-stable
        # (the stub default is now CT).
        kw = {"capability_fn": force_tier_g} if sub == "lean" else {}
        write(f"{sub}.edges.json",
              json.dumps(edge_view(run_lang(sub, **kw)), indent=2, sort_keys=True) + "\n")
    # the CT driver path's golden: kernel-resolved edges from fixtures/lean_ct
    # (invokes the real driver — needs the pinned toolchain reachable)
    write("lean_ct.edges.json",
          json.dumps(edge_view(run_lang("lean_ct")), indent=2, sort_keys=True) + "\n")
