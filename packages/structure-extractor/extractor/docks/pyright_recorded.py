"""Recorded/replaying Pyright backends — deterministic, but still REAL pyright
evidence (captured once from a live run).  Split from pyright_backend.py
(SUB200 restructure) — pyright_backend.py stays the import surface (facade).
"""
from __future__ import annotations

from pathlib import Path

from .pyright_common import StaleRecordingError

# LspPyrightBackend is only a type here; imported for the ctor annotation.
from .pyright_lsp import LspPyrightBackend


def _key(rel_file: str, line: int, character: int) -> str:
    return f"{rel_file}:{line}:{character}"


def _sha(data: bytes) -> str:
    import hashlib
    return hashlib.sha256(data).hexdigest()[:16]


class RecordedPyrightBackend:
    """Replays a recording produced by RecordingWrapper — deterministic, but
    still REAL pyright evidence (captured from a live run).

    Recording format v2 (review C1): {"files": {rel: sha16}, "responses":
    {"rel:line:char": [locations]}}.  Positions are only meaningful against the
    exact bytes they were captured from, so construction REQUIRES the current
    per-file shas and refuses a recording captured from different bytes —
    replaying a stale recording could land positions on whatever node now
    occupies those offsets and mint resolved=true without valid evidence."""

    mode = "recorded-replay"

    def __init__(self, recording: dict, current_file_shas: dict[str, str]):
        if "files" not in recording or "responses" not in recording:
            raise StaleRecordingError(
                "recording has no per-file shas (pre-v2 format) — cannot prove it "
                "matches the current sources; refusing to replay")
        stale = {rel: (sha, current_file_shas.get(rel))
                 for rel, sha in recording["files"].items()
                 if current_file_shas.get(rel) != sha}
        if stale:
            raise StaleRecordingError(
                f"recording captured from different source bytes: {sorted(stale)} — "
                f"re-record (selftest/tools/gen_goldens.py --record-pyright)")
        self.recording = recording["responses"]

    def definitions(self, rel_file: str, line: int, character: int) -> list[dict] | None:
        return self.recording.get(_key(rel_file, line, character))

    def close(self) -> None:
        pass


class RecordingWrapper:
    mode = "live-lsp+recording"

    def __init__(self, inner: LspPyrightBackend, files: list[tuple[str, Path]]):
        self.inner = inner
        self.recording: dict = {
            "files": {rel: _sha(abspath.read_bytes()) for rel, abspath in files},
            "responses": {},
        }

    def definitions(self, rel_file: str, line: int, character: int) -> list[dict] | None:
        result = self.inner.definitions(rel_file, line, character)
        self.recording["responses"][_key(rel_file, line, character)] = result
        return result

    def close(self) -> None:
        self.inner.close()
