"""Facade: the package gates were split by concern (SUB200 restructure) into

    test_codegen_sync.py      codegen byte-sync (gen/* + PIN regenerable)
    test_pin_gate.py          schema PIN drift detection
    test_id_vectors.py        golden id vectors (vectors.json)
    test_worst_of_policy.py   outline worst-of policy (ruling 4)
    test_constants_sync.py    gen/schema_constants.py mirrors schema.json
    test_validate_graph.py    standalone envelope validator
    test_capability_seam.py   capability seam (ruling 2)

`python -m unittest discover -s tests` finds the split files directly (this
module then contributes no tests, so nothing runs twice).  Executing THIS file
— the historical entry point `python tests/test_schema_package.py` — runs the
whole split suite and exits nonzero on failure, exactly as before."""
import sys
import unittest
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent

if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.discover(str(TESTS_DIR), pattern="test_*.py",
                            top_level_dir=str(TESTS_DIR))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
