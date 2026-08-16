"""Pyright backend seam — shared protocol, typed failures, position math.

Split from pyright_backend.py (SUB200 restructure); pyright_backend.py remains
the import surface (facade) and re-exports everything here plus the two
implementations (pyright_lsp.py / pyright_recorded.py).
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Protocol


class BackendTimeout(RuntimeError):
    def __init__(self, backend: str, cmd: str, ms: int):
        super().__init__(f"{backend} timed out after {ms}ms: {cmd}")
        self.backend, self.cmd, self.ms = backend, cmd, ms


class LspError(RuntimeError):
    """A JSON-RPC error response — NOT the same thing as 'no definition'
    (review C8: server failure must never be recorded as negative evidence)."""

    def __init__(self, method: str, code, message: str):
        super().__init__(f"LSP error on {method}: [{code}] {message}")
        self.method, self.code, self.lsp_message = method, code, message


class StaleRecordingError(RuntimeError):
    """The recording was captured from different source bytes than the ones on
    disk now.  Replaying it could bind stale positions onto whatever node NOW
    occupies those offsets — resolved=true without valid evidence (review C1).
    A stale recording is therefore refused wholesale."""


class PyrightBackend(Protocol):
    mode: str

    def definitions(self, rel_file: str, line: int, character: int) -> list[dict] | None:
        """LSP-style definition lookup. Returns a list of
        {file: <rel path or abs external path>, line, character, external: bool},
        [] for 'no definition', or None for 'no answer available'."""
        ...

    def close(self) -> None: ...


def byte_offset_to_position(data: bytes, offset: int) -> tuple[int, int]:
    """byte offset -> (0-based line, UTF-16 character) as LSP wants."""
    prefix = data[:offset]
    line = prefix.count(b"\n")
    col_bytes = prefix.rsplit(b"\n", 1)[-1]
    text = col_bytes.decode("utf8", "replace")
    return line, len(text.encode("utf-16-le")) // 2


def position_to_byte_offset(data: bytes, line: int, character: int) -> int:
    lines = data.split(b"\n")
    prefix = b"\n".join(lines[:line])
    base = len(prefix) + (1 if line > 0 else 0)
    # UTF-16 character -> byte column (fixtures are ASCII; utf-16 units == chars there)
    text = lines[line].decode("utf8", "replace") if line < len(lines) else ""
    units = 0
    for i, ch in enumerate(text):
        if units >= character:
            return base + len(text[:i].encode("utf8"))
        units += len(ch.encode("utf-16-le")) // 2
    return base + len(text.encode("utf8"))


def _norm(p: Path) -> str:
    """Case-normalized absolute path — the reverse-map key.  pyright
    lowercases drive letters in uris (A:→a:); os.path.normcase makes both
    sides comparable on Windows and is the identity on POSIX."""
    import os
    return os.path.normcase(str(p.resolve()))


def _uri_to_path(uri: str) -> Path:
    from urllib.parse import unquote, urlparse
    parsed = urlparse(uri)
    path = unquote(parsed.path)
    if sys.platform == "win32" and path.startswith("/") and ":" in path[:4]:
        path = path[1:]
    return Path(path)
