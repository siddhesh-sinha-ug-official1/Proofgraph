"""Walking-skeleton demo run (§8): three-module Python package, a imports b,
c imported by nobody -> unusedSet == [pkg.c].  Prints the summary and the
probe-stream head so the cell's leads are visible.

    python run_skeleton.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from extractor.pipeline import ExtractorCell, PipelineConfig

HERE = Path(__file__).resolve().parent

cell = ExtractorCell(PipelineConfig(
    roots=["pkg.a"],
    python_package="pkg",
    pyright_mode="none",           # skeleton has no calls; grimp only
    out_dir=HERE / "out" / "skeleton",
))
result = cell.run(HERE / "fixtures" / "python")

print("=== summary ===")
print(json.dumps(result["summary"], indent=2))
print("=== unusedSet ===", result["t3"]["unusedSet"])
print("=== probes fired ===", len(cell.history()), "events,",
      len(cell.bus.fired_probe_ids()), "distinct leads")
for line in cell.history(strip_wall=True)[:12]:
    print(f"  {line['logicalClock']:>3}  {line['probeId']}")
