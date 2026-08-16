"""S2 · Lean DOCK — verdict mapping + driver-decl -> node matching (PURE).

Split from lean_dock.py (SUB200 restructure); lean_dock.py stays the import
surface (facade) — tests import lean_verdict / match_decls from there.
"""
from __future__ import annotations

from ..schema import SchemaNode


def lean_verdict(drv: dict | None, in_span_error: bool,
                 file_has_errors: bool) -> tuple[str, str]:
    """The verdict mapping (REPORT-LEAN-DRIVER-SPIKE.md, restated) as a PURE
    function → (verdict, reason).  green ONLY when kernelAccepted ∧ ¬usesSorry
    ∧ unexpectedAxioms=[] AND the file elaborated error-free; a decl absent
    from decls[] is red only when an error anchors in its span — never green
    from absence."""
    if drv is None:
        if in_span_error:
            return "red", ("decl absent from decls[] with an error-severity "
                           "diagnostic anchored in its span (elaboration failed)")
        return "unknown", ("decl absent from decls[] and no error anchored in "
                           "its span — unjudged; never green from absence")
    if drv.get("usesSorry"):
        return "amber", "usesSorry — proof rests on sorryAx (amber, never green)"
    if in_span_error:
        return "red", "error-severity diagnostic anchored inside the decl span"
    if not drv.get("kernelAccepted"):
        return "unknown", "kernelAccepted false — not in the kernel environment"
    if drv.get("unexpectedAxioms"):
        return "unknown", (f"unexpected axioms beyond the allowlist: "
                           f"{drv['unexpectedAxioms']} — green forbidden")
    if file_has_errors:
        return "unknown", ("file has elaboration errors — green blocked "
                           "(conservative: a poisoned environment attests nothing)")
    return "green", ("kernelAccepted ∧ ¬usesSorry ∧ unexpectedAxioms=[] "
                     "in an error-free file (kernel trustLevel 0)")


def match_decls(file_nodes: list[SchemaNode], drv_names: list[str],
                stem: str) -> tuple[dict[str, SchemaNode], dict[str, str],
                                    list[dict]]:
    """[ASSEMBLY CHANGE REAL-INPUTS] Assign driver decl names to ONE file's
    T1 decl nodes — the disambiguated matching.

    The pre-round rule keyed BOTH sides by the raw last name component
    alone; a REAL input (toolchain source Init/Classical.lean, v4.31.0:
    `choose` inside `namespace Classical` AND top-level `Exists.choose`)
    collides on 'choose' — the last writer silently won, so verdict
    attestations named the WRONG decl (fill.source decl=Exists.choose on
    the Classical.choose node, MEASURED) and proof_uses edges crossed
    nodes (Classical.em's kernel ref Classical.choose resolved to the
    Exists.choose node).  A wrong attestation is worse than no attestation.

    Rules (per file):
      * ident(node) = node.name minus the leading '<stem>.' — the WRITTEN
        identifier T1 minted the node from;
      * a driver decl D (resolved full name) matches a node when
        D == ident (exact) or D endswith '.'+ident (dotted suffix);
        exact beats suffix; among suffix matches the LONGEST ident wins
        (a longer written identifier is the more specific claim);
      * the assignment must be unambiguous BOTH ways: a tie on either side
        attests NOTHING (typed decision; the caller probes every one) —
        never a silent last-writer win, never a crossed attestation.

    Unique-raw-name files (every existing fixture) match exactly as before
    — the rule only ADDS discrimination where the old key collided.
    Returns (by_drv_name, by_node_id, decisions)."""
    prefix = stem + "."
    idents = [(n.name[len(prefix):] if n.name.startswith(prefix) else n.name,
               n) for n in file_nodes]
    best: dict[str, tuple] = {}                 # D -> ((rank, len), node)
    decl_tie: dict[str, list[str]] = {}
    for D in drv_names:
        cands = []
        for ident, n in idents:
            if D == ident:
                cands.append(((2, len(ident)), n))
            elif D.endswith("." + ident):
                cands.append(((1, len(ident)), n))
        if not cands:
            continue
        top_score = max(s for s, _ in cands)
        top = [n for s, n in cands if s == top_score]
        if len(top) > 1:                        # duplicate written identifiers
            decl_tie[D] = sorted(n.id for n in top)
        else:
            best[D] = (top_score, top[0])
    claims: dict[str, list] = {}
    for D, (score, node) in best.items():
        claims.setdefault(node.id, []).append((score, D))
    by_drv: dict[str, SchemaNode] = {}
    by_node: dict[str, str] = {}
    node_tie: set[str] = set()
    outranked: dict[str, str] = {}
    for node_id, cl in claims.items():
        cl.sort(reverse=True)                   # deterministic: score then name
        if len(cl) > 1 and cl[0][0] == cl[1][0]:
            node_tie.add(node_id)
            continue
        winner = cl[0][1]
        by_drv[winner] = best[winner][1]
        by_node[node_id] = winner
        for _, D in cl[1:]:
            outranked[D] = node_id
    decisions: list[dict] = []
    for D in drv_names:
        if D in by_drv:
            decisions.append({
                "decl": D, "nodeId": by_drv[D].id, "outcome": "matched",
                "method": "exact" if best[D][0][0] == 2 else "suffix"})
        elif D in decl_tie:
            decisions.append({
                "decl": D, "nodeId": None, "outcome": "ambiguous",
                "candidates": decl_tie[D],
                "reason": "several nodes tie on the identifier suffix — "
                          "never attest ambiguously"})
        elif D in best and best[D][1].id in node_tie:
            decisions.append({
                "decl": D, "nodeId": None, "outcome": "ambiguous",
                "contendedNodeId": best[D][1].id,
                "reason": "several driver decls tie for the same node — "
                          "never attest ambiguously"})
        elif D in outranked:
            decisions.append({
                "decl": D, "nodeId": None, "outcome": "outranked",
                "contendedNodeId": outranked[D],
                "reason": "a stronger (exact / longer-suffix) driver decl "
                          "owns this node"})
        else:
            decisions.append({"decl": D, "nodeId": None,
                              "outcome": "no-owner"})
    return by_drv, by_node, decisions
