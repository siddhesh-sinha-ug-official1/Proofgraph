"""Wire-level plumbing of the LSP spine: exceptions, path<->uri conversion,
Content-Length framing, the expected-methods table, and the shim argv.
Split out SUB200 from spine.py (the facade re-exports everything)."""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse


class ServerCrashed(Exception):
    pass


class SpineTimeout(Exception):
    pass


def path_to_uri(path: str) -> str:
    p = os.path.abspath(path).replace("\\", "/")
    # [ASSEMBLY CHANGE V1] canonical lowercase drive letter: real servers
    # (pyright) normalize `A:` -> `a:` in every uri they publish, so a
    # client that sends uppercase can never string-match its own document
    # back (P1/P2 wait on uri equality).  The shim ECHOES whatever form it
    # was given, so fixture-language behavior is unchanged.
    if re.match(r"^[A-Za-z]:", p):
        p = p[0].lower() + p[1:]
    if not p.startswith("/"):
        p = "/" + p
    return "file://" + urllib.parse.quote(p)


def uri_to_path(uri: str) -> str:
    p = urllib.parse.unquote(urllib.parse.urlparse(uri).path)
    if re.match(r"^/[A-Za-z]:", p):
        p = p[1:]
    return os.path.normpath(p)


def read_framed(stream):
    """Read one Content-Length framed JSON message from a binary stream (None on EOF)."""
    length = None
    while True:
        line = stream.readline()
        if line == b"":
            return None
        if line in (b"\r\n", b"\n"):
            break
        if line.lower().startswith(b"content-length:"):
            try:
                length = int(line.split(b":", 1)[1])
            except ValueError:
                return None
    if length is None:
        return None
    body = b""
    while len(body) < length:
        chunk = stream.read(length - len(body))
        if not chunk:
            return None
        body += chunk
    try:
        return json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


def write_framed(stream, obj) -> None:
    data = json.dumps(obj).encode("utf-8")
    stream.write(b"Content-Length: %d\r\n\r\n" % len(data))
    stream.write(data)
    stream.flush()


# Methods the layer would like → the capability key that advertises them.
EXPECTED_METHODS = [
    ("textDocument/hover", "hoverProvider"),
    ("textDocument/definition", "definitionProvider"),
    ("textDocument/references", "referencesProvider"),
    ("textDocument/documentSymbol", "documentSymbolProvider"),
    ("textDocument/completion", "completionProvider"),
    ("textDocument/rename", "renameProvider"),
    ("textDocument/semanticTokens/full", "semanticTokensProvider"),
    ("textDocument/prepareCallHierarchy", "callHierarchyProvider"),
    ("textDocument/prepareTypeHierarchy", "typeHierarchyProvider"),
    ("textDocument/diagnostic", "diagnosticProvider"),
]


def shim_argv() -> list:
    """Argv to spawn the reference shim by file path (run standalone it
    bootstraps sys.path itself and imports its split-out siblings — see
    shim/ybg_lsp.py)."""
    shim_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "shim", "ybg_lsp.py")
    return [sys.executable, shim_path]
