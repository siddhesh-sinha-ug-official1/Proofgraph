"""Pyright backend seam — the semantic gold standard, driven as a SUBPROCESS.

Decision D2 (probed as extractor.t2.py.scip.fallback): grimp for imports +
Pyright-DIRECT for calls; scip-python is NOT depended on (it lags Pyright and
its 2026 activity is unconfirmed).  Pylance is proprietary — never embedded.

Two interchangeable implementations of one protocol:
  * LspPyrightBackend    — live `pyright-langserver --stdio` over JSON-RPC
                           (npx subprocess; nothing is linked).
  * RecordedPyrightBackend — replays a recording a live run produced; this is
                           what the deterministic golden tests use.  The
                           recording is REAL pyright evidence, captured once.
RecordingWrapper wraps live and captures a recording for later replay.

SUB200 restructure: this module is now the FACADE.  The protocol, typed
failures and position math live in pyright_common.py; the live client in
pyright_lsp.py; the recorded/replaying pair in pyright_recorded.py.  The
public surface here is unchanged — importers need zero edits.
"""
from __future__ import annotations

from .pyright_common import (BackendTimeout, LspError, PyrightBackend,  # noqa: F401
                             StaleRecordingError, _norm, _uri_to_path,
                             byte_offset_to_position, position_to_byte_offset)
from .pyright_lsp import LspPyrightBackend
from .pyright_recorded import (RecordedPyrightBackend, RecordingWrapper,  # noqa: F401
                               _key, _sha)

__all__ = [
    "BackendTimeout", "LspError", "StaleRecordingError", "PyrightBackend",
    "byte_offset_to_position", "position_to_byte_offset",
    "LspPyrightBackend", "RecordedPyrightBackend", "RecordingWrapper",
]
