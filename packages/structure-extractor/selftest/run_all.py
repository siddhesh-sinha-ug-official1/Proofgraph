"""Run the whole self-test suite: python selftest/run_all.py [--fast]

--fast skips the live-pyright oracle (which spawns a real language server).
The cell must self-test in isolation (Operating Contract 6).
"""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

PATTERN = "test_*.py"

if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.discover(str(HERE), pattern=PATTERN)
    if "--fast" in sys.argv:
        filtered = unittest.TestSuite()
        for group in suite:
            for case in group:
                if "live_pyright" not in str(case):
                    filtered.addTest(case)
        suite = filtered
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
