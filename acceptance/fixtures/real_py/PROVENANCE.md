# PROVENANCE — real_py/colorama (REAL-INPUTS round, worklist item 3b)

**What**: the six top-level pure-python modules of **colorama 0.4.6**,
vendored BYTE-VERBATIM as a previously-unseen REAL input for outerwall
`analyze()` regression coverage (`outerwall/test_real_inputs.py`).

- **Origin**: the build machine's installed wheel —
  `<user-home>\AppData\Roaming\Python\Python312\site-packages\colorama\`
  (PyPI `colorama==0.4.6`; upstream https://github.com/tartley/colorama).
- **Version**: 0.4.6 (dist-info `colorama-0.4.6.dist-info`, Metadata 2.1).
- **License**: **BSD-3-Clause** (permissive) — Copyright (c) 2010 Jonathan
  Hartley.  Full text vendored alongside as `LICENSE.colorama.txt` (the
  in-file headers say "see LICENSE file"); each module retains its own
  copyright header untouched.
- **Vendored subset**: `__init__.py`, `ansi.py`, `ansitowin32.py`,
  `initialise.py`, `win32.py`, `winterm.py` — the whole importable package
  minus its `tests/` directory (test modules import pytest and are not part
  of the analyzed library surface).  No file was modified in any way.
- **Why this package**: compact (882 lines), pure python, permissively
  licensed, genuinely real-world (terminal ANSI handling with ctypes,
  cross-module imports, class hierarchies) and in NO way derived from the
  demo fixtures.

**Pinned bytes** (sha256 — asserted by `test_real_inputs.py`; a drifted
fixture is a build failure):

| file | sha256 |
|---|---|
| `colorama/__init__.py` | `c1e3d0038536d2d2a060047248b102d38eee70d5fe83ca512e9601ba21e52dbf` |
| `colorama/ansi.py` | `4e8a7811e12e69074159db5e28c11c18e4de29e175f50f96a3febf0a3e643b34` |
| `colorama/ansitowin32.py` | `bcf3586b73996f18dbb85c9a568d139a19b2d4567594a3160a74fba1d5e922d9` |
| `colorama/initialise.py` | `fa1227cbce82957a37f62c61e624827d421ad9ffe1fdb80a4435bb82ab3e28b5` |
| `colorama/win32.py` | `61038ac0c4f0b4605bb18e1d2f91d84efc1378ff70210adae4cbcf35d769c59b` |
| `colorama/winterm.py` | `5c24050c78cf8ba00760d759c32d2d034d87f89878f09a7e1ef0a378b78ba775` |

**Analysis config of record** (the frozen regression):
`analyze(fixtures/real_py/colorama, roots=['colorama.initialise'],
config={'extractor': {'roots': ['colorama.initialise'], 'python_package':
'colorama', 'pyright_mode': 'live'}})` — live pyright through the REAL V1
capability feed.
