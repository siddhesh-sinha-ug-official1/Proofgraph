/**
 * Phases 1–2 of headless_ui.mjs (carved VERBATIM — SUB200 restructure,
 * wave 2): app readiness polls, then page facts — DOM/a11y + the graph
 * wall's OWN pins — with the census/paint checks (incl. colored-by-verdict
 * greens, zero-green pages, module-stays-unknown, ghost placeholders).
 */

// ── phase 1: app ready — graph nodes rendered (or a NAMED banner) ──────────
export async function waitAppReady({ pollPage, sleep }) {
  await pollPage(
    "document.querySelectorAll('.react-flow__node').length > 0 || document.querySelectorAll('.banner-error').length > 0",
    120000, "graph nodes or a named banner");
  // editor pane reaches a terminal phase (ready/failed) before facts are read
  await pollPage(
    "(!document.querySelector('.editor-pane-wrap')) || !!document.querySelector('.editor-pane-wrap .pane-status-ready, .editor-pane-wrap .pane-status-failed')",
    45000, "editor pane terminal phase");
  await sleep(1500); // paint/pin settle (bounded; facts below are polled reads)
}

// ── phase 2: page facts — DOM/a11y + the graph wall's OWN pins ─────────────
export const readFacts = `(() => {
    const gw = window.pgGraphWall ?? null;
    const dump = gw ? gw.pins.dump() : null;
    const hist = gw ? gw.pins.history() : [];
    const paints = dump ? dump.paints : null;
    const sel = document.querySelector('.status-selected code');
    return {
      title: document.title,
      nodeCount: document.querySelectorAll('.react-flow__node').length,
      renderedEdges: document.querySelectorAll('.react-flow__edge').length,
      banners: [...document.querySelectorAll('.banner')].map(b => b.textContent),
      statusBar: document.querySelector('[role="status"][data-testid="status-bar"]')?.textContent ?? null,
      editorStatusLine: document.querySelector('.editor-pane-wrap .pane-status')?.textContent ?? null,
      activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-tab') ?? null,
      paints,
      paintStatuses: paints ? [...new Set(Object.values(paints).flatMap(p => [p.fillStatus, p.outlineStatus]))].sort() : null,
      outlineWasNullAny: paints ? Object.values(paints).some(p => p.outlineWasNull) : null,
      leadGuardCount: hist.filter(e => e.probeId === 'render.edge.leadGuard').length,
      selectedIdDom: sel ? sel.textContent : null,
    };
  })()`;

export async function phaseFacts({ evaluate, check, E, J }) {
  const facts = await evaluate(readFacts);

  check("app-ready", facts.nodeCount > 0 && facts.paints !== null,
    `react-flow nodes rendered (${facts.nodeCount}); pgGraphWall paints served`);
  check("node-census", facts.nodeCount === E.servedNodes + E.ghosts,
    `rendered node census ${facts.nodeCount} == served ${E.servedNodes} + ghosts ${E.ghosts}`);
  check("edge-census", facts.renderedEdges === E.renderedEdges,
    `rendered edge census ${facts.renderedEdges} == expected ${E.renderedEdges} (leads render dashed, resolved render solid)`);
  check("lead-guards", facts.leadGuardCount === E.leadGuards,
    `render.edge.leadGuard fired ${facts.leadGuardCount}x == expected ${E.leadGuards}`);
  check("analysis-line", (facts.statusBar ?? "").includes(E.analysisLine),
    `a11y role=status bar carries ${J(E.analysisLine)} (got: ${J((facts.statusBar ?? "").slice(0, 200))})`);
  check("paint-statuses", J(facts.paintStatuses) === J(E.paintStatuses),
    `dump().paints status vocabulary ${J(facts.paintStatuses)} == expected ${J(E.paintStatuses)}`);

  // colored-by-verdict: every expected green paints the canonical #2E7D32 and
  // its id exists in the DOM byte-identically ([data-id] attribute selector).
  const greenEv = [];
  for (const g of E.greens) {
    const p = (facts.paints ?? {})[g.id];
    const inDom = await evaluate(`!!document.querySelector('.react-flow__node[data-id=' + ${J(J(g.id))} + ']')`);
    check(`green-paint:${g.name}`,
      !!p && p.fillStatus === "green" && p.fillColor === E.greenColor && p.fillHatched === false && inDom,
      `${g.id} paints fill green ${E.greenColor} on the wall's own pins AND renders in the DOM ([data-id] byte-identical)`);
    greenEv.push({ id: g.id, name: g.name, paint: p ?? null, inDom });
  }
  if (E.greens.length === 0) {
    const anyGreen = Object.values(facts.paints ?? {}).some(
      (p) => p.fillStatus === "green" || p.outlineStatus === "green"
        || p.fillColor === E.greenColor || p.outlineColor === E.greenColor);
    check("zero-green", !anyGreen,
      `NO paint (fill or ring, status or color ${E.greenColor}) is green anywhere on this page`);
  }
  if (E.moduleUnknownId) {
    const p = (facts.paints ?? {})[E.moduleUnknownId];
    check("module-stays-unknown",
      !!p && p.fillStatus === "unknown" && p.fillHatched === true && p.fillColor !== E.greenColor,
      `${E.moduleUnknownId} (not kernel-judged) stays unknown/hatched, never green`);
  }
  for (const gid of E.ghostIds ?? []) {
    const inDom = await evaluate(`!!document.querySelector('.react-flow__node[data-id=' + ${J(J(gid))} + ']')`);
    const p = (facts.paints ?? {})[gid];
    check(`ghost:${gid}`, inDom && (!p || (p.fillStatus === "unknown" && p.fillColor !== E.greenColor)),
      `ghost placeholder ${gid} renders (unknown, never green)`);
  }
  return { facts, greenEv };
}
