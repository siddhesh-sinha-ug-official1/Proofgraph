"""ybg-lsp compiler plumbing: every `ybc` invocation (a lead with request
AND response), deterministic scratch files, line lookup, and the
diagnostics path (map_ybc_diag / diagnostics_for).  Split out SUB200 from
ybg_lsp.py."""

import json
import os
import subprocess

from .ybg_state import (MODE, SEVERITY, STATE, STRUCTURE_LIKE, TMPDIR, YBC,
                        byte_col_to_char, path_to_uri, probe, send,
                        uri_to_path)

# --------------------------------------------------------------------------
# ybc subprocess plumbing — every invocation is a lead with request AND response.
# --------------------------------------------------------------------------

def run_ybc(args, lead, cause=None):
    """Invoke ybc; returns (CompletedProcess|None, cause_token) so derived leads
    (check.diag, columnMap, ...) can chain causally to the invocation lead."""
    argv = list(YBC) + list(args)
    try:
        cp = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8",
                            timeout=30)
    except Exception as e:  # spawn failure is surfaced, never swallowed
        token = probe(lead, "call", {"argv": argv, "stdout": "",
                                     "stderr": repr(e), "exitCode": None}, cause)
        probe("capability.shim.error", "error",
              {"argv": argv, "stderr": repr(e), "exitCode": None}, token)
        return None, token
    token = probe(lead, "call", {"argv": argv, "stdout": cp.stdout,
                                 "stderr": cp.stderr,
                                 "exitCode": cp.returncode}, cause)
    if cp.returncode != 0:
        probe("capability.shim.error", "error",
              {"argv": argv, "stderr": cp.stderr, "exitCode": cp.returncode},
              token)
        return None, token
    return cp, token


def scratch_file(prefix, text):
    """Deterministic scratch file (no random temp names — probe streams must repro)."""
    STATE["scratch"] += 1
    path = os.path.join(TMPDIR, "%s-%03d.ybg" % (prefix, STATE["scratch"]))
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def line_text(uri_or_path, line_1based):
    """Line text for column conversion: open doc if we have it, else read from disk."""
    if uri_or_path in STATE["docs"]:
        text = STATE["docs"][uri_or_path]
    else:
        path = uri_to_path(uri_or_path) if uri_or_path.startswith("file:") else uri_or_path
        uri = path_to_uri(path)
        if uri in STATE["docs"]:
            text = STATE["docs"][uri]
        else:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    text = f.read()
            except OSError:
                return ""
    lines = text.split("\n")
    return lines[line_1based - 1] if 1 <= line_1based <= len(lines) else ""


# --------------------------------------------------------------------------
# Diagnostics — the skeleton's diagnostics_for, instrumented.
# --------------------------------------------------------------------------

def map_ybc_diag(entry, line_str):
    """Map one raw ybc diagnostic to an LSP Diagnostic.

    Returns (lsp_diag | None, column_map, notes). Missing endCol falls back to
    col+1; unknown severity falls back to 3 (info) — both are notes, not drops."""
    notes = []
    if not isinstance(entry, dict) or "line" not in entry or "col" not in entry:
        return None, None, ["missing line/col — rejected"]
    line0 = entry["line"] - 1
    col = entry["col"]
    end_col = entry.get("endCol")
    if end_col is None:
        end_col = col + 1
        notes.append("missing endCol — defaulted to col+1")
    sev_name = entry.get("severity", "info")
    sev = SEVERITY.get(sev_name)
    if sev is None:
        sev = 3
        notes.append("unknown severity %r — defaulted to 3" % sev_name)
    start_char = byte_col_to_char(line_str, col)
    end_char = byte_col_to_char(line_str, end_col)
    column_map = {"ybcLine": entry["line"], "ybcCol": col, "ybcEndCol": end_col,
                  "lspChar": start_char, "encoding": STATE["encoding"]}
    diag = {"range": {"start": {"line": line0, "character": start_char},
                      "end": {"line": line0, "character": end_char}},
            "severity": sev, "source": "ybc", "message": entry.get("message", "")}
    return diag, column_map, notes


def diagnostics_for(uri, text):
    if MODE == "trickster":
        # the same canned "error" for every document, clean or not
        send({"method": "textDocument/publishDiagnostics",
              "params": {"uri": uri, "diagnostics": [
                  {"range": {"start": {"line": 0, "character": 0},
                             "end": {"line": 0, "character": 1}},
                   "severity": 1, "source": "trick",
                   "message": "totally real type error, please believe me"}]}})
        return
    if STRUCTURE_LIKE:
        # The zls shape: our "own analyzer" sees no type errors — ever.
        send({"method": "textDocument/publishDiagnostics",
              "params": {"uri": uri, "diagnostics": []}})
        return
    path = scratch_file("check", text)
    cp, cause = run_ybc(["check", "--format=json", path],
                        "capability.shim.check.call")
    try:
        os.unlink(path)
    except OSError:
        pass
    diags = []
    if cp is not None:
        try:
            raw = json.loads(cp.stdout or "[]")
        except ValueError:
            probe("capability.shim.error", "error",
                  {"argv": "check output parse", "stderr": cp.stdout, "exitCode": 0})
            raw = []
        for entry in raw:
            lstr = ""
            if isinstance(entry, dict) and "line" in entry:
                lines = text.split("\n")
                if 1 <= entry["line"] <= len(lines):
                    lstr = lines[entry["line"] - 1]
            diag, column_map, notes = map_ybc_diag(entry, lstr)
            if diag is None:
                probe("capability.shim.check.diag", "node",
                      {"accepted": False, "raw": entry, "why": "; ".join(notes)}, cause)
                continue
            probe("capability.shim.columnMap", "value", column_map, cause)
            probe("capability.shim.check.diag", "node",
                  {"accepted": True, "raw": entry, "lsp": diag,
                   "why": "; ".join(notes) if notes else None}, cause)
            diags.append(diag)
    send({"method": "textDocument/publishDiagnostics",
          "params": {"uri": uri, "diagnostics": diags}})
