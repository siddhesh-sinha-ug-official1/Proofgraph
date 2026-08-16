"""Stage C — Paper-score: the S1–S6 depth-scoring rubric (playbook §3).

Produces the PROVISIONAL tier — the README's claim, before anything runs.
Retained in the final Capability as `paperTier` so a reader can see where the
paper lied (paperTier=CT, tier=S is the Zig/zls story); the gap is itself a lead.
S5/S6 grade shippability, not depth.
"""

from __future__ import annotations

STAGE = "score"


def _emit(bus, sid, answer, evidence):
    bus.emit(f"capability.score.{sid}", "decision",
             {"answer": answer, "evidence": evidence}, stage=STAGE)
    return answer


def run(bus, profile: dict, disc: dict, survivors: list[dict]) -> dict:
    lang = profile["lang"]
    modes = disc["compilerModes"]
    has_check = any(m.startswith("check") for m in modes)
    reuses = [c for c in survivors if c.get("reusesCompiler")]

    # S1 — official/blessed OR reuses the real compiler as a library?
    if disc["officialLsp"]:
        s1 = _emit(bus, "s1", "yes", "the toolchain ships a built-in LSP mode")
    elif reuses:
        s1 = _emit(bus, "s1", "yes",
                   f"{reuses[0]['name']} claims to reuse the real compiler frontend "
                   f"(paper claim — the probe will test it)")
    elif has_check:
        s1 = _emit(bus, "s1", "partial",
                   f"no server anywhere, but the compiler exposes {modes} — "
                   f"compiler-truth reachable via a DIY shim (mechanism-ladder rung 4)")
    else:
        s1 = _emit(bus, "s1", "no", "no official server, no compiler reuse, no check mode")

    # S2 — statically typed with a real checker?
    if profile["typing"] == "static":
        s2 = _emit(bus, "s2", "yes", "statically typed with a real checker")
    else:
        s2 = _emit(bus, "s2", "no",
                   f"typing={profile['typing']} — structural ceiling unless a "
                   f"gradual tool exists (the language's nature, not a tooling failure)")

    # S3 — cross-file name resolution AND dependency indexing?
    if "query def" in modes:
        s3 = _emit(bus, "s3", "yes",
                   "`ybc query def --root` resolves names across files and into deps")
    elif any(c.get("claimsCrossFile") for c in survivors):
        s3 = _emit(bus, "s3", "yes",
                   f"{survivors[0]['name']} README claims workspace-wide navigation "
                   f"(UNVERIFIED paper claim — the probe will test it)")
    elif any(c.get("semanticLayer") for c in survivors):
        s3 = _emit(bus, "s3", "partial",
                   f"{survivors[0]['name']} claims workspace navigation (unprobed)")
    else:
        s3 = _emit(bus, "s3", "no", "no cross-file resolution surface found")

    # S4 — completion-after-import resolves members WITH types/signatures?
    if any(m.startswith("doc") for m in modes):
        s4 = _emit(bus, "s4", "yes",
                   "`ybc doc --format=json` enumerates per-module APIs with signatures")
    elif any(c.get("claimsTypedCompletion") for c in survivors):
        s4 = _emit(bus, "s4", "yes",
                   f"{survivors[0]['name']} README claims typed completion "
                   f"(UNVERIFIED paper claim — the probe will test it)")
    elif any(c.get("semanticLayer") for c in survivors):
        s4 = _emit(bus, "s4", "partial", "server claims completion (unprobed)")
    else:
        s4 = _emit(bus, "s4", "no", "no library-surfacing mechanism found")

    # S5 — maintenance-safe? (gates shippability, not depth)
    if survivors and all("stale" not in c.get("maintenanceNote", "")
                         for c in survivors):
        s5 = _emit(bus, "s5", "yes",
                   f"survivors alive: {[c['name'] for c in survivors]}")
    elif survivors:
        s5 = _emit(bus, "s5", "partial",
                   f"kept-with-caveat: {[c['maintenanceNote'] for c in survivors]}")
    elif profile.get("compilerCLI"):
        s5 = _emit(bus, "s5", "partial",
                   "no server to maintain; the compiler itself is the maintained artifact")
    else:
        s5 = _emit(bus, "s5", "no", "nothing maintained exists")

    # S6 — OSS and legally embeddable? (gates shippability, not depth)
    vetoed = [c for c in disc["candidates"] if c not in survivors
              and c.get("license") in ("closed", "BUSL", None)]
    if survivors and all(c["licenseVerdict"] == "embed-safe" for c in survivors):
        s6 = _emit(bus, "s6", "yes", "all survivors carry permissive licenses")
    elif profile.get("compilerCLI") and not survivors:
        s6 = _emit(bus, "s6", "yes",
                   "the DIY shim is ours (permissive); the compiler is driven "
                   "out-of-process only")
    elif survivors:
        s6 = _emit(bus, "s6", "partial",
                   f"subprocess-only survivors: "
                   f"{[c['name'] for c in survivors if c['licenseVerdict'] != 'embed-safe']}")
    else:
        s6 = _emit(bus, "s6", "no", f"license traps: {[c['name'] for c in vetoed]}")

    # Mapping (playbook §3): S1∧S2∧S3∧S4 mostly-Yes → CT; S2 No + a server → S;
    # only a grammar → G; nothing → P.
    deep = [s1, s2, s3, s4]
    yes_count = sum(1 for a in deep if a == "yes")
    if s2 == "yes" and yes_count >= 3:
        paper = "CT"
    elif survivors:
        paper = "S"
    elif disc["grammar"]["exists"]:
        paper = "G"
    else:
        paper = "P"

    maint_grade = {"yes": "A", "partial": "B", "no": "F"}[s5]
    license_grade = {"yes": "A", "partial": "B", "no": "F"}[s6]

    bus.emit("capability.score.paperTier", "value", paper, stage=STAGE)
    bus.emit("capability.score.grades", "value",
             {"maintGrade": maint_grade, "licenseGrade": license_grade}, stage=STAGE)

    return {"s1": s1, "s2": s2, "s3": s3, "s4": s4, "s5": s5, "s6": s6,
            "paperTier": paper, "maintGrade": maint_grade,
            "licenseGrade": license_grade}
