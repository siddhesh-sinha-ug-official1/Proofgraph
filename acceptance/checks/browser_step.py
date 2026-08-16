"""step 3 — HEADLESS UI acceptance (real Chromium over CDP; DOM/a11y/pins,
ZERO pixel screenshots; --skip-ui only for emergencies).

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2);
the spec-building block lives in ui_specs.build_specs, the server plumbing
in ui_servers.
"""
from __future__ import annotations

import json
from pathlib import Path

from .common import APP_DIR, FIXTURES, bound, check, kill_tree, sha256_file, skip
from .ui_servers import _spawn_vite, _ui_page, free_port
from .ui_specs import GREEN_COLOR, _utf8, build_specs


def ui_step(moat, lean, ceiling) -> bool | None:
    """Returns True/False for pass/fail, None for a LOGGED skip.

    The full on-screen path, asserted WITHOUT a person and WITHOUT pixels:
      (1) the file OPENS with verdict markers — shell.file.open (source
          hub-fs) + a11y tab strip + cell 4's editor.verdict.gutter.paint
          pins (glyph classes, honest origin/tier treatment);
      (2) the graph renders nodes COLORED BY VERDICT — dump().paints incl.
          the kernel greens #2E7D32 on the lean page, each id present in the
          DOM byte-identically;
      (3) BRUSHING both directions — a real graph-node click AND a real CDP
          Monaco caret click carry the SAME byte-identical id across BOTH
          walls' pins (re-verified here as UTF-8 byte arrays against THIS
          process's independent analysis parse);
      (4) the unknown-tier (typst) input renders unknown, never green —
          paints, gutter, ghost placeholders, AI honest no-claim."""
    print("== step 3: HEADLESS UI acceptance (DEFAULT — real Chromium over "
          "CDP; DOM/a11y + spike-surface pins; EPHEMERAL vite+hub+ai per "
          "page; ZERO pixel screenshots) ==", flush=True)

    if not (APP_DIR / "node_modules").is_dir():
        skip("ui-acceptance", "app/node_modules missing — run npm install in "
             "app/ first (LOGGED skip, not a pass)")
        return None

    fixture_files = [FIXTURES / "moatpkg" / f
                     for f in ("core.py", "helpers.py", "__init__.py")]
    fixture_files += [FIXTURES / "unused_hyp.lean",
                      FIXTURES / "honest_ceiling.typ"]
    before = {str(p): sha256_file(p) for p in fixture_files}

    sp = build_specs(moat, lean, ceiling)
    mn, ln, cn = sp["mn"], sp["ln"], sp["cn"]
    lean_green_ids = sp["lean_green_ids"]
    moat_spec, lean_spec, ceiling_spec = sp["specs"]

    vite_proc, vite_logf = None, None
    try:
        vite_proc = None
        for attempt in range(3):
            vite_port = free_port()
            try:
                vite_proc, vite_logf = _spawn_vite(vite_port)
                break
            except RuntimeError:
                if attempt == 2:
                    raise

        rc1, ev1 = _ui_page(moat, "moat", moat_spec, vite_port,
                            FIXTURES / "moatpkg",
                            {"package": "moatpkg", "pyrightMode": "live"})
        if rc1 == 3:
            skip("ui-acceptance",
                 f"{ev1.get('detail', 'no Chromium binary found')} — manual "
                 "steps documented in app/README.md (LOGGED skip)")
            return None
        rc2, ev2 = _ui_page(lean, "lean", lean_spec, vite_port,
                            FIXTURES / "unused_hyp.lean",
                            {"pyrightMode": "none"})
        rc3, ev3 = _ui_page(ceiling, "ceiling", ceiling_spec, vite_port,
                            FIXTURES / "honest_ceiling.typ",
                            {"pyrightMode": "none"})

        after = {str(p): sha256_file(p) for p in fixture_files}
        fixtures_ok = before == after

        # BYTE re-verification in THIS process: the UTF-8 arrays each page
        # reported for its brushing pins vs the independently parsed analysis.
        def brush_bytes_ok(ev, g2e_id, e2g_id):
            br = ev.get("brush") or {}
            g = br.get("graphToEditor") or {}
            ok = (g.get("busNodeIdUtf8") == _utf8(g2e_id)
                  and g.get("revealNodeIdUtf8") == _utf8(g2e_id)
                  and g.get("graphSelectOutUtf8") == _utf8(g2e_id))
            if e2g_id is not None:
                e = br.get("editorToGraph") or {}
                ok = ok and (e.get("editorEmitUtf8") == _utf8(e2g_id)
                             and e.get("graphSelectInUtf8") == _utf8(e2g_id))
            return ok

        moat_bytes_ok = brush_bytes_ok(ev1, mn["moatpkg.core.main"],
                                       mn["moatpkg.core.side_calc"])
        lean_bytes_ok = brush_bytes_ok(ev2, ln["unused_hyp.uses_base"],
                                       ln["unused_hyp.base_fact"])
        ceil_bytes_ok = brush_bytes_ok(ev3, cn["honest_ceiling.bound"], None)

        # the green paints re-verified from the evidence (pins, not pixels)
        lean_paints = (ev2.get("facts") or {}).get("paints") or {}
        greens_ok = bool(lean_green_ids) and all(
            (lean_paints.get(gid) or {}).get("fillStatus") == "green"
            and (lean_paints.get(gid) or {}).get("fillColor") == GREEN_COLOR
            for gid in lean_green_ids)
        ceil_paints = (ev3.get("facts") or {}).get("paints") or {}
        ceil_green_free = ("green" not in json.dumps(ceil_paints)
                           and (ev3.get("gutter") or {}).get("greenGlyphCount") == 0)

        ok = (rc1 == 0 and rc2 == 0 and rc3 == 0
              and ev1.get("ok") is True and ev2.get("ok") is True
              and ev3.get("ok") is True
              and fixtures_ok and moat_bytes_ok and lean_bytes_ok
              and ceil_bytes_ok and greens_ok and ceil_green_free)

        def failed(ev):
            return [ch["name"] for ch in (ev.get("checks") or [])
                    if not ch.get("pass")] or (
                [ev.get("failureClass")] if ev.get("failureClass") else [])

        n_checks = sum(len(ev.get("checks") or []) for ev in (ev1, ev2, ev3))
        check("ui-acceptance", ok,
              f"REAL browser ({Path(str(ev1.get('browser'))).name}, "
              "headless=new over CDP), DOM/a11y + spike-surface pins, ZERO "
              f"pixel screenshots — {n_checks} named page-checks green across "
              "three pages on EPHEMERAL vite+hub+ai: moat — core.py opens "
              "from hub-fs (temp-copy workspace) with amber DEBT gutter "
              "markers (origin assumed, cell 4's own treatment), 6 unknown "
              "paints, brushing BOTH directions (graph click ↔ REAL Monaco "
              "caret click) byte-identical on both walls' pins + the a11y "
              "status-bar selection, AI names the unused id; lean — "
              f"{len(lean_green_ids)} kernel greens paint {GREEN_COLOR} on "
              "the wall's own dump().paints (module stays unknown), the "
              "resolved proof_uses edge renders (0 leadGuards), "
              "unused_hyp.lean opened via the REAL explorer flow, gutter "
              "greens HONESTLY BLOCKED at the tier-G stub floor "
              "(green-may-never-be-faked; the CT gutter green is §7(i)'s "
              "headless proof), green-node brushing byte-identical; ceiling "
              "— all-unknown paints + ghost placeholders, dashed leads only, "
              "honest_ceiling.typ opens with debt markers, AI honest "
              "no-claim; fixtures byte-identical before/after "
              f"({fixtures_ok}); id bytes re-verified in python (UTF-8)",
              {"moat": {"rc": rc1, "failed": failed(ev1),
                        "facts": ev1.get("facts"), "brush": ev1.get("brush")},
               "lean": {"rc": rc2, "failed": failed(ev2),
                        "facts": ev2.get("facts"), "brush": ev2.get("brush"),
                        "gutter": ev2.get("gutter")},
               "ceiling": {"rc": rc3, "failed": failed(ev3),
                           "facts": ev3.get("facts")},
               "bytesReverified": {"moat": moat_bytes_ok,
                                   "lean": lean_bytes_ok,
                                   "ceiling": ceil_bytes_ok},
               "fixturesUntouched": fixtures_ok})
        bound("headless UI acceptance runs by DEFAULT (worklist item 5): no "
              "person, no pixel screenshots — browser facts are DOM/a11y "
              "reads + the walls' own pins; browser_shot.mjs (screenshots) "
              "remains a MANUAL tool only, outside this gate")
        bound("browser editor floor: the lean page's ATTESTED kernel greens "
              "are BLOCKED at the tier-G stub floor by cell 4's guard "
              "(green-may-never-be-faked, downgraded to unknown) — the "
              "MEASURED-tier CT gutter green is proven headless in §7(i); "
              "REPORT-GREENFLOW bound 4, now asserted in the gate")
        bound("ui-step workspaces are TEMP COPIES of the fixtures (deleted "
              "after each page); real fixtures byte-identical before/after "
              f"(sha256: {fixtures_ok})")
        return ok
    except Exception as exc:  # noqa: BLE001 — surfaced, typed, never silent
        check("ui-acceptance", False, f"headless UI step crashed: {exc}", None)
        return False
    finally:
        kill_tree(vite_proc)
        if vite_logf is not None:
            vite_logf.close()
