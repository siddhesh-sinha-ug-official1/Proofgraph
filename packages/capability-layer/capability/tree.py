"""Stage D — the decision-tree walk (playbook §1): five rungs, STOP at first Yes.

Every rung is a lead; every rung ABOVE the chosen one gets a rejected lead with
the reason the deeper tier was unreachable — the honest-ceiling narrative.
The three compose-with-any-tier extras (grammar, SCIP, library sources) are
collected once per walk whatever rung is chosen, and a dynamically-typed
language gets its independent ceiling lead (capped at S — the language's
nature, not a tooling failure).
"""

from __future__ import annotations

STAGE = "tree"

RUNG_TIER = {"official": "CT", "community": "CT", "structure": "S",
             "grammar": "G", "plaintext": "P"}


def run(bus, profile: dict, disc: dict, survivors: list[dict]) -> dict:
    rungs = []

    def rung(name, taken, reason):
        bus.emit(f"capability.tree.rung.{name}", "branch",
                 {"taken": taken, "reason": reason}, stage=STAGE)
        rungs.append({"rung": name, "taken": taken, "reason": reason})
        return taken

    chosen = None

    # Rung 1 — official/blessed server?
    if rung("official", disc["officialLsp"],
            "the toolchain ships a built-in lsp mode" if disc["officialLsp"]
            else "no `<compiler> lsp` subcommand; no official server in any index"):
        chosen = "official"

    # Rung 2 — community server reusing the real frontend?
    community = [c for c in survivors if c.get("reusesCompiler")]
    if chosen is None and rung(
            "community", bool(community),
            (f"{community[0]['name']} claims to reuse the compiler frontend "
             f"(paper claim; the probe will test it)") if community
            else "no community server reusing the real frontend exists"):
        chosen = "community"

    # Rung 3 — maintained structure server?
    structure = [c for c in survivors if not c.get("reusesCompiler")
                 and c.get("semanticLayer")]
    non_semantic = [c for c in survivors if not c.get("reusesCompiler")
                    and not c.get("semanticLayer")]
    if chosen is None and rung(
            "structure", bool(structure),
            (f"{structure[0]['name']} provides real navigation (not type truth)")
            if structure else
            (f"{non_semantic[0]['name']} provides no semantic layer beyond the "
             f"tree-sitter tree ({non_semantic[0].get('maintenanceNote', '')})"
             if non_semantic else "no structure server exists")):
        chosen = "structure"

    # Rung 4 — a tree-sitter grammar?
    g = disc["grammar"]
    if chosen is None and rung(
            "grammar", bool(g["exists"]),
            (f"grammar available ({g['source']}); partial={g['partial']}")
            if g["exists"] else "no grammar in any index — must be authored"):
        chosen = "grammar"

    # Rung 5 — plaintext (always yes as the last resort).
    if chosen is None:
        rung("plaintext", True,
             "nothing above exists — plaintext + own lexer / drive the compiler CLI")
        chosen = "plaintext"
    else:
        # rungs BELOW the chosen one are not walked or recorded: the tree
        # stops at first Yes (only rungs ABOVE it get rejected leads below)
        pass

    # rejected leads: every rung ABOVE the chosen one, with why
    order = ["official", "community", "structure", "grammar", "plaintext"]
    for r in rungs:
        if order.index(r["rung"]) < order.index(chosen) and not r["taken"]:
            bus.emit("capability.tree.rejected", "branch",
                     {"rung": r["rung"], "whyRejected": r["reason"]}, stage=STAGE)

    # the independent dynamic-typing ceiling
    if profile["typing"] == "dynamic":
        bus.emit("capability.tree.dynamicCeiling", "decision",
                 {"typing": "dynamic", "cappedAt": "S",
                  "note": "a dynamically typed language cannot give sound "
                          "whole-program type truth; ceiling = structure + optional "
                          "gradual typing — the language's nature, not laziness"},
                 stage=STAGE)

    # the three extras, ALWAYS collected
    extras = {"grammar": disc["grammar"], "scip": disc["scip"],
              "libSources": disc["libSources"]}
    bus.emit("capability.tree.extras", "value", extras, stage=STAGE)

    provisional = RUNG_TIER[chosen]
    if profile["typing"] == "dynamic" and provisional == "CT":
        provisional = "S"
    bus.emit("capability.tree.chosen", "decision",
             {"chosenRung": chosen, "provisionalTier": provisional}, stage=STAGE)

    return {"rungs": rungs, "chosenRung": chosen, "provisionalTier": provisional,
            "extras": extras}
