"""linegate — the sub-200 line ceiling as an ENFORCED INVARIANT (wave 3).

    python linegate.py            (from proofgraph/ or anywhere)

Walks the working tree, counts lines of every SOURCE file (extensions listed
in the manifest), applies the EXPLICIT exemption manifest
(linegate-exemptions.json — compiled from the 13 SUB200 wave reports'
exemption lists; every entry carries its reason string), and

  * FAILS (exit 1) listing offenders if ANY non-exempt source file is over
    the ceiling (200 lines) — failure class: line-gate-violation;
  * WARN-ONLY stats: files in the 151-200 band (over the ~135-150 comfort
    target, under the ceiling) — informational, never failing.

Exemptions are NEVER implicit: an unlisted directory or file is in scope.
The gate audits its own manifest first (ceiling sane, every rule carries a
non-empty reason) and refuses to run on a malformed manifest.
Wired into run_all_suites.py as a suite row; fault (f) in faultcheck plants
a 250-line file in a scratch copy and asserts this gate names it and exits 1.
"""
from __future__ import annotations

import fnmatch
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = ROOT / "linegate-exemptions.json"
FAILURE_CLASS = "line-gate-violation"

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:                             # noqa: BLE001 — best effort
        pass


def load_manifest() -> dict:
    """Load + audit the manifest: every rule must carry a non-empty reason."""
    m = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    problems = []
    if not isinstance(m.get("ceiling"), int) or m["ceiling"] < 100:
        problems.append("ceiling missing/implausible")
    if not m.get("sourceExtensions"):
        problems.append("sourceExtensions missing")
    for kind, keyname in (("dirNameRules", "name"),
                          ("directoryRules", "path"),
                          ("fileRules", "pattern")):
        for rule in m.get(kind, []):
            if not str(rule.get(keyname, "")).strip():
                problems.append(f"{kind} entry missing '{keyname}': {rule}")
            if not str(rule.get("reason", "")).strip():
                problems.append(f"{kind} entry missing reason: {rule}")
    if problems:
        print("line-gate: MALFORMED MANIFEST — refusing to run")
        for p in problems:
            print(f"  ! {p}")
        sys.exit(2)
    return m


def exemption_reason(rel: str, manifest: dict) -> str | None:
    """First matching manifest rule's reason for posix relpath `rel`, or None.
    (dirNameRules are applied during the walk, not here.)"""
    for rule in manifest.get("directoryRules", []):
        p = rule["path"].rstrip("/")
        if rel == p or rel.startswith(p + "/"):
            return rule["reason"]
    for rule in manifest.get("fileRules", []):
        if fnmatch.fnmatch(rel, rule["pattern"]):
            return rule["reason"]
    return None


def count_lines(path: Path) -> int:
    return len(path.read_bytes().splitlines())


def scan(manifest: dict):
    """Yield (relpath, lines) for every in-scope source file under ROOT."""
    exts = tuple(manifest["sourceExtensions"])
    skip_names = {r["name"] for r in manifest.get("dirNameRules", [])}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in skip_names)
        for fn in sorted(filenames):
            if not fn.endswith(exts):
                continue
            full = Path(dirpath) / fn
            yield full.relative_to(ROOT).as_posix(), full


def main() -> int:
    manifest = load_manifest()
    ceiling = manifest["ceiling"]
    band_floor = manifest.get("bandFloor", 150)
    checked = exempted = 0
    offenders: list[tuple[str, int]] = []
    band: list[tuple[str, int]] = []
    for rel, full in scan(manifest):
        reason = exemption_reason(rel, manifest)
        if reason is not None:
            exempted += 1
            continue
        n = count_lines(full)
        checked += 1
        if n > ceiling:
            offenders.append((rel, n))
        elif n > band_floor:
            band.append((rel, n))

    print(f"line-gate manifest: {MANIFEST_PATH.name} "
          f"(ceiling {ceiling}, band floor {band_floor})")
    print(f"tree: {ROOT}")
    print(f"in-scope source files checked: {checked} "
          f"(+ {exempted} exempt by manifest rule)")

    print(f"\nWARN-ONLY band ({band_floor + 1}-{ceiling} lines — over the "
          f"~135-{band_floor} comfort target, under the ceiling): "
          f"{len(band)} files")
    for rel, n in sorted(band, key=lambda t: -t[1]):
        print(f"    warn {n:>4}  {rel}")

    if offenders:
        print(f"\n{FAILURE_CLASS}: {len(offenders)} non-exempt source "
              f"file(s) over {ceiling} lines:")
        for rel, n in sorted(offenders, key=lambda t: -t[1]):
            print(f"    {FAILURE_CLASS} {n:>4}  {rel}")
        print("\nEither restructure the file under the ceiling (facade "
              "pattern, see the SUB200 reports) or add an EXPLICIT manifest "
              "entry with its reason.")
    verdict = "FAILED" if offenders else "OK"
    print(f"\nline-gate: {len(offenders)} offenders / {checked} source files "
          f"checked, {len(band)} in the {band_floor + 1}-{ceiling} band  ->  "
          f"{verdict}")
    return 1 if offenders else 0


if __name__ == "__main__":
    sys.exit(main())
