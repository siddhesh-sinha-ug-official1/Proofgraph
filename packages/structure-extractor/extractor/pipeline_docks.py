"""Per-language dock construction for the pipeline (split from pipeline.py,
SUB200 restructure — ExtractorCell._make_dock delegates here verbatim).

The docks mapping is a PARAMETER: the cell passes pipeline.ALL_DOCKS resolved
at call time, so test seams that patch `extractor.pipeline.ALL_DOCKS` (the
forged-dock tier-guard test) keep working unchanged.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .docks.pyright_backend import (LspPyrightBackend, RecordedPyrightBackend,
                                    RecordingWrapper, StaleRecordingError)
from .ingest import SourceSet
from .pipeline_config import PipelineConfig
from .probe import ProbeBus


def make_dock(cfg: PipelineConfig, bus: ProbeBus, lang: str, ss: SourceSet,
              all_docks: dict):
    if lang == "lean":
        # kernel-driver knobs threaded from config (test seam for the
        # driver-dead paths; None keeps the dock's measured defaults)
        return all_docks["lean"](timeout_s=cfg.lean_driver_timeout_s,
                                 lean_exe=cfg.lean_driver_exe)
    if lang != "python":
        return all_docks[lang]()
    backend = None
    proot = Path(ss.project_root).resolve()
    # Files are keyed by the DOCK's vocabulary (ingest-root-relative
    # f.path) — the same keys _calls_and_inherits queries with — and the
    # backend didOpens/queries their ABSOLUTE paths under the detected
    # project root (remediation round: package-root-uri-mismatch fix;
    # when ingest root == project root the keys are byte-identical to the
    # old project-root-relative form, so recordings stay valid).
    files, outside = [], []
    for f in ss.files:
        try:
            f.abspath.resolve().relative_to(proot)
            files.append((f.path, f.abspath))
        except ValueError:
            outside.append(f.path)      # never a crash, never silent (C9)
    if outside and cfg.pyright_mode != "none":
        bus.emit("extractor.cap.applied", "S2.docks", "decision", {
            "capName": "python.pyright.file-outside-project-root",
            "limit": f"pyright workspace root is {ss.project_root}",
            "actual": len(outside), "dropped": outside})
    if cfg.pyright_mode in ("live", "record"):
        backend = LspPyrightBackend(proot, files)
        if cfg.pyright_mode == "record":
            backend = RecordingWrapper(backend, files)
    elif cfg.pyright_mode == "recorded":
        recording = json.loads(cfg.pyright_recording_path.read_text(encoding="utf8"))
        current_shas = {rel: hashlib.sha256(abspath.read_bytes()).hexdigest()[:16]
                        for rel, abspath in files}
        try:
            backend = RecordedPyrightBackend(recording, current_shas)
        except StaleRecordingError as exc:
            # a stale recording must never mint resolved edges (C1):
            # refuse it, probe the refusal, run with no backend (leads only)
            bus.emit("extractor.error.caught", "S2.docks", "error", {
                "stage": "S2.docks", "exception": f"StaleRecordingError: {exc}",
                "sourceSpan": None})
            bus.emit("extractor.cap.applied", "S2.docks", "decision", {
                "capName": "python.pyright.recording-stale",
                "limit": "recording shas must match current sources",
                "actual": "mismatch — replay refused",
                "dropped": "calls/inherits resolution (candidates become leads)"})
            backend = None
    return all_docks["python"](package=cfg.python_package, pyright_backend=backend,
                               grimp_roots=list(cfg.roots))
