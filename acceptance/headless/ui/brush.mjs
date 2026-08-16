/**
 * Phase 5 of headless_ui.mjs (carved VERBATIM — SUB200 restructure,
 * wave 2): BRUSHING — the same byte-identical id across BOTH walls' pins,
 * a real graph-node click one way and a REAL CDP Monaco caret click back.
 */

export async function phaseBrush({ evaluate, pollPage, realClick, check, E, J, sleep }) {
  const brush = { graphToEditor: null, editorToGraph: null };

  if (E.brush?.graphToEditor) {
    const id = E.brush.graphToEditor.nodeId;
    await evaluate(`(() => {
      const el = document.querySelector('.react-flow__node[data-id=' + ${J(J(id))} + ']');
      if (!el) throw new Error('no rendered node ' + ${J(id)});
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    })()`);
    await pollPage(`(() => {
      const ed = window.pgEditorWall ?? null;
      if (!ed) return false;
      const busLog = ed.pins.dump().busLog ?? [];
      return busLog.some(e => e.origin === 'graph' && e.nodeId === ${J(id)});
    })()`, 15000, `editor busLog carries the graph click ${id}`);
    brush.graphToEditor = await evaluate(`(() => {
      const enc = new TextEncoder();
      const ed = window.pgEditorWall;
      const gw = window.pgGraphWall;
      const busLog = ed.pins.dump().busLog ?? [];
      const busEntry = busLog.filter(e => e.origin === 'graph' && e.nodeId === ${J(id)}).at(-1) ?? null;
      const reveal = ed.pins.history()
        .filter(e => e.probeId === 'editor.select.recv.reveal' && e.payload.nodeId === ${J(id)})
        .at(-1)?.payload ?? null;
      const selOut = gw.pins.history()
        .filter(e => e.probeId === 'link.select.out' && e.payload.nodeId === ${J(id)})
        .at(-1)?.payload ?? null;
      const selDom = document.querySelector('.status-selected code')?.textContent ?? null;
      const inspectorId = document.querySelector('[data-testid="inspector"] .inspector-id')?.textContent ?? null;
      return {
        clicked: ${J(id)},
        busEntry,
        busNodeIdUtf8: busEntry ? Array.from(enc.encode(busEntry.nodeId)) : null,
        reveal,
        revealNodeIdUtf8: reveal ? Array.from(enc.encode(reveal.nodeId)) : null,
        graphSelectOut: selOut,
        graphSelectOutUtf8: selOut ? Array.from(enc.encode(selOut.nodeId)) : null,
        statusBarSelection: selDom,
        inspectorId,
        byteIdentical: !!busEntry && busEntry.nodeId === ${J(id)}
          && !!reveal && reveal.nodeId === ${J(id)}
          && !!selOut && selOut.nodeId === ${J(id)},
      };
    })()`);
    check("brush-graph-to-editor",
      brush.graphToEditor.byteIdentical
      && brush.graphToEditor.reveal?.highlightApplied === true
      && brush.graphToEditor.statusBarSelection === id
      && brush.graphToEditor.inspectorId === id,
      `graph click ${id} → BOTH walls' pins byte-identical (graph link.select.out × editor busLog origin:graph × ` +
      `editor.select.recv.reveal highlightApplied:true) + a11y: status-bar selection and inspector show the SAME id`);
  }

  if (E.brush?.editorToGraph) {
    const b = E.brush.editorToGraph;
    // locate the target Monaco line by its (normalized) text, then the exact
    // caret column via a DOM Range — a REAL CDP mouse click lands the caret
    // INSIDE the declaration name (never a synthetic event: Monaco listens
    // for genuine input).
    let clicked = false;
    let clickDetail = "";
    for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
      const target = await evaluate(`(() => {
        const norm = (s) => (s ?? '').replace(/\\u00a0/g, ' ');
        const lines = [...document.querySelectorAll('.editor-pane-wrap .view-line')];
        const el = lines.find(l => norm(l.textContent).startsWith(${J(b.linePrefix)}));
        if (!el) return { found: false, lineCount: lines.length };
        // walk text nodes to caret column ${J(b.caretCol)} for an exact rect
        let remaining = ${J(b.caretCol)};
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && remaining >= node.textContent.length) {
          remaining -= node.textContent.length;
          node = walker.nextNode();
        }
        if (!node) return { found: false, reason: 'caretCol beyond line text' };
        const range = document.createRange();
        range.setStart(node, remaining);
        range.setEnd(node, remaining + 1);
        const r = range.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const at = document.elementFromPoint(x, y);
        return { found: true, x, y,
          unobstructed: !!at && !!at.closest('.editor-pane-wrap') };
      })()`);
      if (!target.found) {
        clickDetail = `target line ${J(b.linePrefix)} not rendered (${JSON.stringify(target)})`;
        await sleep(700);
        continue;
      }
      if (!target.unobstructed) {
        clickDetail = "target line obstructed by another window";
        await sleep(700);
        continue;
      }
      await realClick(target.x, target.y);
      try {
        await pollPage(`(() => {
          const ed = window.pgEditorWall ?? null;
          if (!ed) return false;
          const emits = ed.pins.history().filter(e => e.probeId === 'editor.select.emit.bus');
          return emits.some(e => e.payload.busEvent?.nodeId === ${J(b.nodeId)});
        })()`, 6000, "editor select emit");
        clicked = true;
      } catch {
        clickDetail = `click landed but no editor.select.emit.bus for ${b.nodeId} (attempt ${attempt + 1})`;
      }
    }
    brush.editorToGraph = !clicked ? { ok: false, detail: clickDetail } : await evaluate(`(() => {
      const enc = new TextEncoder();
      const ed = window.pgEditorWall;
      const gw = window.pgGraphWall;
      const emit = ed.pins.history()
        .filter(e => e.probeId === 'editor.select.emit.bus' && e.payload.busEvent?.nodeId === ${J(b.nodeId)})
        .at(-1)?.payload.busEvent ?? null;
      const selIn = gw.pins.history()
        .filter(e => e.probeId === 'link.select.in' && e.payload.nodeId === ${J(b.nodeId)})
        .at(-1)?.payload ?? null;
      const selection = gw.pins.dump().selection ?? null;
      const selDom = document.querySelector('.status-selected code')?.textContent ?? null;
      return {
        ok: true,
        caretClicked: ${J(b.linePrefix)},
        editorEmit: emit,
        editorEmitUtf8: emit ? Array.from(enc.encode(emit.nodeId)) : null,
        graphSelectIn: selIn,
        graphSelectInUtf8: selIn ? Array.from(enc.encode(selIn.nodeId)) : null,
        graphSelectedId: selection ? selection.selectedId : null,
        statusBarSelection: selDom,
        byteIdentical: !!emit && emit.nodeId === ${J(b.nodeId)}
          && !!selIn && selIn.nodeId === ${J(b.nodeId)}
          && selection?.selectedId === ${J(b.nodeId)},
      };
    })()`);
    check("brush-editor-to-graph",
      brush.editorToGraph.ok === true
      && brush.editorToGraph.byteIdentical === true
      && brush.editorToGraph.editorEmit?.origin === "editor"
      && brush.editorToGraph.graphSelectIn?.source === "editor"
      && brush.editorToGraph.statusBarSelection === b.nodeId,
      clicked
        ? `REAL Monaco caret click on ${J(b.linePrefix)} → editor.select.emit.bus ${b.nodeId} → graph ` +
          `link.select.in (source:editor) → selection.selectedId — BOTH walls' pins byte-identical + a11y status-bar selection`
        : clickDetail);
  }

  return brush;
}
