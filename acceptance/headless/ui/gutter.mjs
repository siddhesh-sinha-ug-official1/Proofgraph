/**
 * Phase 4 of headless_ui.mjs (carved VERBATIM — SUB200 restructure,
 * wave 2): VERDICT MARKERS — cell 4's own gutter pins (never pixels),
 * incl. the tier-G green-blocked assertions.
 */

export async function phaseGutter({ evaluate, pollPage, check, E, J }) {
  let gutter = null;
  if (E.gutter) {
    const ids = E.gutter.nodeIds;
    await pollPage(`(() => {
      const ed = window.pgEditorWall ?? null;
      if (!ed) return false;
      const paints = ed.pins.history().filter(e => e.probeId === 'editor.verdict.gutter.paint');
      return ${J(ids)}.every(id => paints.some(p => p.payload.nodeId === id));
    })()`, 30000, "editor gutter pins for every expected node");
    gutter = await evaluate(`(() => {
      const ed = window.pgEditorWall;
      const hist = ed.pins.history();
      const enc = new TextEncoder();
      const last = (probeId, id) => {
        const hits = hist.filter(e => e.probeId === probeId && e.payload.nodeId === id);
        return hits.length ? hits[hits.length - 1].payload : null;
      };
      return {
        paints: ${J(ids)}.map(id => {
          const p = last('editor.verdict.gutter.paint', id);
          return p ? { ...p, nodeIdUtf8: Array.from(enc.encode(p.nodeId)) } : null;
        }),
        guards: ${J(ids)}.map(id => last('editor.verdict.green.guard', id)),
        blocked: ${J(ids)}.map(id => last('editor.verdict.green.blocked', id)),
        greenGlyphCount: hist.filter(e => e.probeId === 'editor.verdict.gutter.paint'
          && e.payload.glyphClass === 'pg-fill-green').length,
      };
    })()`);
    check("gutter-markers", gutter.paints.every((p) => p !== null),
      `editor.verdict.gutter.paint fired for all ${ids.length} nodes of the open file — the file opens WITH verdict markers`);
    for (let i = 0; i < ids.length; i++) {
      const p = gutter.paints[i];
      const wantGlyph = (E.gutter.glyphById ?? {})[ids[i]];
      if (p && wantGlyph) {
        check(`gutter-glyph:${ids[i]}`, p.glyphClass === wantGlyph,
          `gutter glyph ${p.glyphClass} == expected ${wantGlyph} (honest origin/tier treatment)`);
      }
    }
    check("gutter-never-green", gutter.greenGlyphCount === E.gutter.greenGlyphCount,
      `pg-fill-green glyph count ${gutter.greenGlyphCount} == expected ${E.gutter.greenGlyphCount} ` +
      `(browser editor mounts the stub floor at tier G — the CT gutter green is the HEADLESS §7(i) proof)`);
    if (E.gutter.greenBlocked) {
      for (const gid of E.gutter.greenBlocked.ids) {
        const i = ids.indexOf(gid);
        const guard = gutter.guards[i];
        const blk = gutter.blocked[i];
        check(`green-blocked-at-G:${gid}`,
          !!guard && guard.wouldBeGreen === true && guard.greenAllowed === false
          && guard.tier === "G" && String(guard.reason).includes(E.gutter.greenBlocked.guardReasonContains)
          && !!blk && blk.reason === E.gutter.greenBlocked.blockedReason && blk.downgradedTo !== "green",
          `attested kernel green ${gid} is HONESTLY blocked at the browser's tier-G stub floor ` +
          `(guard greenAllowed:false ${J(guard?.reason ?? null)}; blocked ${J(blk?.reason ?? null)} → ${J(blk?.downgradedTo ?? null)})`);
      }
    }
  }
  return gutter;
}
