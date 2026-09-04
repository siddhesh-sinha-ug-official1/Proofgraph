"""hub/server_fs.py — the app-shell workspace + path-JAILED /fs surface
(APP-SHELL-CONTRACT.md): the browser NEVER touches the filesystem, every
file op goes through here, jailed to the declared workspace root.

SUB200 restructure: split out of hub/server.py; WorkspaceFsMixin is composed
into HubServer by the facade (hub/server.py).  Behavior unchanged.
"""
from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path, PureWindowsPath

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline

HubError = hub_pipeline.HubError


class WorkspaceFsMixin:
    """HubServer's workspace-fs face (state lives on HubServerCore.__init__)."""

    def set_workspace(self, root, package=None, pyright_mode=None,
                      declared_roots=None, note: str = ""):
        """Declare THE workspace root — the fs jail every /fs/* path must
        resolve inside (resolve + commonpath check; symlinks in the root
        itself are resolved here once).  Declared, never inferred: the hub
        does not guess a workspace from a pipeline run — serve_app and
        POST /analyze both declare it explicitly.  Logged, never silent."""
        resolved = Path(root).resolve()
        if not resolved.is_dir():
            raise HubError("fs-io-error",
                           f"workspace root {str(root)!r} is not an existing "
                           f"directory (resolved {str(resolved)!r})")
        self._workspace = {
            "root": str(resolved),
            "rootResolved": resolved,
            "package": package,
            "pyrightMode": pyright_mode,
            "declaredRoots": list(declared_roots) if declared_roots else [],
            "analyzedAt": time.time_ns(),
        }
        self.log.emit("hub.workspace.set", {
            "root": str(resolved), "package": package,
            "pyrightMode": pyright_mode,
            "declaredRoots": self._workspace["declaredRoots"], "note": note})
        return self._workspace

    def workspace_payload(self) -> dict:
        ws = self._workspace
        if ws is None:
            raise HubError("workspace-not-open",
                           "no workspace root has been declared — serve_app "
                           "start or POST /analyze declares one; the hub never "
                           "guesses a filesystem jail")
        return {"root": ws["root"], "package": ws["package"],
                "declaredRoots": list(ws["declaredRoots"]),
                "analyzedAt": ws["analyzedAt"],
                "pyrightMode": ws["pyrightMode"]}

    def resolve_fs_path(self, rel, op: str) -> Path:
        """THE jail.  A relative path is resolved under the workspace root and
        must STAY under it: absolute paths, drive-qualified paths (incl. the
        drive-relative 'C:x' form), leading separators, ..\\ traversal and
        symlink escapes are ALL refused with the named class path-escape
        (resolve() follows symlinks BEFORE the commonpath check, so a link
        pointing outside the jail cannot smuggle reads or writes)."""
        ws = self._workspace
        if ws is None:
            raise HubError("workspace-not-open",
                           f"/fs/{op} before any workspace root was declared")
        raw = str(rel or "")
        pure = PureWindowsPath(raw)
        if (pure.is_absolute() or pure.drive
                or raw.startswith(("/", "\\"))
                or Path(raw).is_absolute()):
            raise HubError("path-escape",
                           f"/fs/{op} path {raw!r} is absolute or "
                           f"drive-qualified — only workspace-relative paths "
                           f"cross this membrane")
        root = ws["rootResolved"]
        candidate = (root / raw).resolve()
        root_cased = os.path.normcase(str(root))
        try:
            common = os.path.commonpath(
                [root_cased, os.path.normcase(str(candidate))])
        except ValueError as exc:   # different drives on Windows
            raise HubError("path-escape",
                           f"/fs/{op} path {raw!r} resolves onto a different "
                           f"drive than the workspace root ({exc})") from exc
        if common != root_cased:
            raise HubError("path-escape",
                           f"/fs/{op} path {raw!r} resolves to "
                           f"{str(candidate)!r}, outside the workspace root "
                           f"{str(root)!r} (traversal or symlink escape)")
        return candidate

    def _rel_of(self, target: Path) -> str:
        """workspace-relative posix-style display path for payloads/pins."""
        return target.relative_to(
            self._workspace["rootResolved"]).as_posix() if (
            target != self._workspace["rootResolved"]) else "."

    def fs_list(self, rel) -> dict:
        target = self.resolve_fs_path(rel, "list")
        if not target.exists():
            raise HubError("fs-io-error",
                           f"/fs/list path {str(rel)!r} does not exist")
        if not target.is_dir():
            raise HubError("fs-io-error",
                           f"/fs/list path {str(rel)!r} is not a directory "
                           f"— use /fs/file for files")
        entries = []
        try:
            children = sorted(target.iterdir(),
                              key=lambda p: (p.is_file(), p.name.lower()))
        except OSError as exc:
            raise HubError("fs-io-error",
                           f"/fs/list cannot read {str(rel)!r}: {exc}") from exc
        for child in children:
            is_dir = child.is_dir()
            size = None
            if not is_dir:
                try:
                    size = child.stat().st_size
                except OSError:
                    size = None  # file removed between iterdir() and stat()
            entries.append({
                "name": child.name,
                "kind": "dir" if is_dir else "file",
                "size": size,
            })
        payload = {"path": self._rel_of(target), "entries": entries}
        self.log.emit("hub.fs.list",
                      {"path": payload["path"], "entries": len(entries)})
        return payload

    def fs_read(self, rel) -> dict:
        target = self.resolve_fs_path(rel, "read")
        if not target.is_file():
            raise HubError("fs-io-error",
                           f"/fs/file path {str(rel)!r} is not an existing "
                           f"file")
        try:
            data = target.read_bytes()
        except OSError as exc:
            raise HubError("fs-io-error",
                           f"/fs/file cannot read {str(rel)!r}: {exc}") from exc
        sha = hashlib.sha256(data).hexdigest()
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HubError(
                "fs-io-error",
                f"/fs/file {str(rel)!r} is not valid utf-8 (binary?): {exc} "
                f"— utf-8 files only this round (APP-SHELL-CONTRACT), the "
                f"hub never serves bytes it would misrepresent") from exc
        payload = {"path": self._rel_of(target), "encoding": "utf8",
                   "content": text, "sha256": sha, "byteLen": len(data)}
        self.log.emit("hub.fs.read", {"path": payload["path"], "sha256": sha,
                                      "bytes": len(data)})
        return payload

    def fs_write(self, rel, content) -> dict:
        if not isinstance(content, str):
            raise HubError("hub-bad-request",
                           "PUT /fs/file requires a JSON body "
                           "{path, content:str} — utf-8 text this round")
        target = self.resolve_fs_path(rel, "write")
        if target.is_dir():
            raise HubError("fs-io-error",
                           f"/fs/file write target {str(rel)!r} is a "
                           f"directory")
        if not target.parent.is_dir():
            raise HubError("fs-io-error",
                           f"/fs/file write target {str(rel)!r} has no "
                           f"existing parent directory — the hub creates "
                           f"files, not directory trees")
        data = content.encode("utf-8")
        try:
            target.write_bytes(data)
        except OSError as exc:
            raise HubError("fs-io-error",
                           f"/fs/file cannot write {str(rel)!r}: {exc}") from exc
        sha = hashlib.sha256(data).hexdigest()
        payload = {"path": self._rel_of(target), "sha256": sha,
                   "byteLen": len(data)}
        self.log.emit("hub.fs.write", {"path": payload["path"], "sha256": sha,
                                       "bytes": len(data)})
        return payload
