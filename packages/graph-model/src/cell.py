"""The graph-model cell: a headless, deterministic, single-pass pipeline of
eight stages, instrumented at maximum probe density.

Entry points (the maximal diagnostic surface for this round):
  run(inputPath, rootsPath) -> {graph, projections, t3Result}
  probeCatalog()            -> every available lead
  dump()                    -> the ENTIRE internal state at the moment of call
  tap(probeId, cb)          -> subscribe to one live lead
  history()                 -> the ordered probe stream for the last run
"""
import time
from copy import deepcopy
from pathlib import Path

from .errors import CellError, GateFailure
from .ids import sha256_hex
from .importgate import ImportBoundaryViolation, run_gate
from .probe import CELL_ID, ProbeBus
from .stages import PIPELINE


class GraphModelCell:
    def __init__(self, cell_root=None):
        self.cell_root = Path(cell_root) if cell_root else Path(__file__).resolve().parents[1]
        self.bus = ProbeBus()
        self._state = {}
        self._last_gate = None

    # ---- entry points ----
    def probeCatalog(self):
        return self.bus.catalog()

    def history(self):
        return self.bus.history()

    def tap(self, probe_id, callback):
        return self.bus.tap(probe_id, callback)

    def dump(self):
        """The ENTIRE internal state at the moment of call (Contract 3.4)."""
        return deepcopy({
            "cellId": CELL_ID,
            "cellRoot": str(self.cell_root),
            "importGate": self._last_gate,
            "state": self._state,
            "historyLength": len(self.bus.history()),
            "logicalClock": self.bus.clock,
            "catalogSize": len(self.bus.catalog()),
        })

    def run(self, input_path, roots_path, manifest_path=None, extra_gate_files=None):
        """One headless pipeline pass.  Paths are relative to the cell root
        (absolute paths are accepted if they lie under it).  extra_gate_files
        exists so the self-test can inject a forbidden import and watch the
        gate flip."""
        bus = self.bus
        bus.reset_run()
        cfg = {
            "inputPath": self._rel(input_path),
            "rootsPath": self._rel(roots_path),
            "manifestPath": self._rel(manifest_path) if manifest_path
                            else self._default_manifest(self._rel(input_path)),
        }

        input_bytes = (self.cell_root / cfg["inputPath"]).read_bytes()
        input_sha = sha256_hex(input_bytes)
        run_id = "run_" + input_sha[:12]  # deterministic: derived from input, not wall time
        begin_ref = bus.emit("graph-model.harness.run.begin", "harness", "state",
                             {"runId": run_id, "inputSha256": input_sha, "startClock": 0})

        # Import-boundary gate: wired BEFORE features (Operating Contract rule 3).
        gate = run_gate(self.cell_root, extra_files=extra_gate_files)
        self._last_gate = gate
        gate_ref = bus.emit("graph-model.harness.importGate", "harness", "decision",
                            gate, cause=begin_ref)

        ctx = {"config": cfg}
        ok = False
        try:
            if not gate["pass"]:
                raise ImportBoundaryViolation(
                    f"failure-class=import-boundary-violation: {gate['violations']}")
            prev_ref = gate_ref
            for stage_name, stage_mod in PIPELINE:
                prev_ref = self._run_stage(stage_name, stage_mod.run, ctx, prev_ref)
            ok = bool(ctx["roundtrip"]["verdict"]["pass"]) and gate["pass"]
        except ImportBoundaryViolation as exc:
            # raised by the harness itself, so not yet probed (stage-raised
            # errors are already probed at the stage boundary)
            bus.emit("graph-model.harness.error", "harness", "error",
                     {"stage": "harness", "errorClass": type(exc).__name__,
                      "message": str(exc), "causeId": gate_ref}, cause=gate_ref)
            raise
        finally:
            self._state = ctx
            bus.emit("graph-model.harness.clock", "harness", "state",
                     {"logicalClock": bus.clock}, cause=begin_ref)
            bus.emit("graph-model.harness.run.end", "harness", "state",
                     {"runId": run_id, "endClock": bus.clock,
                      "eventCount": bus.clock + 1, "ok": ok}, cause=begin_ref)

        return {"graph": ctx["projections"]["graph"],
                "projections": ctx["projections"],
                "t3Result": ctx["t3"]}

    # ---- internals ----
    def _run_stage(self, name, fn, ctx, prev_ref):
        """Uniform stage boundary: __in / __out / __timing probes around every
        stage; any exception becomes a probed harness.error before re-raising."""
        bus = self.bus
        in_ref = bus.emit(f"{CELL_ID}.{name}.__in", name, "input", deepcopy(ctx),
                          cause=prev_ref)
        wall_start = time.time_ns()
        try:
            fn(self, ctx, in_ref)
        except Exception as exc:
            bus.emit("graph-model.harness.error", "harness", "error",
                     {"stage": name, "errorClass": type(exc).__name__,
                      "message": str(exc), "causeId": in_ref}, cause=in_ref)
            if isinstance(exc, GateFailure):
                raise
            raise CellError(name, type(exc).__name__, str(exc)) from exc
        wall_end = time.time_ns()
        out_ref = bus.emit(f"{CELL_ID}.{name}.__out", name, "output", deepcopy(ctx),
                           cause=in_ref)
        bus.emit(f"{CELL_ID}.{name}.__timing", name, "timing",
                 {"stage": name, "wallNanosStart": wall_start,
                  "wallNanosEnd": wall_end, "deltaNanos": wall_end - wall_start},
                 cause=out_ref)
        return out_ref

    def _rel(self, path):
        p = Path(path)
        if p.is_absolute():
            p = p.relative_to(self.cell_root)
        return p.as_posix()

    @staticmethod
    def _default_manifest(input_rel):
        p = Path(input_rel)
        return p.with_name(p.stem + ".manifest.json").as_posix()
