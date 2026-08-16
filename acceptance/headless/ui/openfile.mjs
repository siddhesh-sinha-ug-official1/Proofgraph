/**
 * Phase 3 of headless_ui.mjs (carved VERBATIM — SUB200 restructure,
 * wave 2): the file OPENS (shell probes + a11y tab strip) — the initial
 * tab and the REAL explorer flow.
 */

export async function phaseOpenFiles({ evaluate, pollPage, check, E, J }) {
  const waitFileOpen = async (relPath, source, what) => {
    await pollPage(`(() => {
      const h = (window.pgShellLog?.history() ?? []);
      return h.some(e => e.probeId === 'shell.file.open'
        && e.payload.relPath === ${J(relPath)}
        && e.payload.source === ${J(source)});
    })()`, 30000, `shell.file.open ${relPath} (${what})`);
    await pollPage(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-tab') === ${J(relPath)}`,
      15000, `a11y tab strip: ${relPath} selected`);
    await pollPage(`(() => {
      const h = (window.pgShellLog?.history() ?? []);
      return h.some(e => e.probeId === 'shell.editor.mount' && e.payload.relPath === ${J(relPath)});
    })()`, 45000, `shell.editor.mount ${relPath}`);
    await pollPage(
      "!!document.querySelector('.editor-pane-wrap .pane-status-ready')",
      45000, `editor pane ready for ${relPath}`);
    return evaluate(`(() => {
      const h = (window.pgShellLog?.history() ?? []);
      const open = h.filter(e => e.probeId === 'shell.file.open' && e.payload.relPath === ${J(relPath)}).at(-1) ?? null;
      const mount = h.filter(e => e.probeId === 'shell.editor.mount' && e.payload.relPath === ${J(relPath)}).at(-1) ?? null;
      return {
        openPayload: open ? open.payload : null,
        mountPayload: mount ? mount.payload : null,
        activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-tab') ?? null,
        editorStatusLine: document.querySelector('.editor-pane-wrap .pane-status')?.textContent ?? null,
      };
    })()`);
  };

  let initialOpen = null;
  if (E.initialOpen) {
    initialOpen = await waitFileOpen(E.initialOpen.relPath, E.initialOpen.source, "initial tab");
    check("file-opens", initialOpen.activeTab === E.initialOpen.relPath
      && initialOpen.openPayload?.source === E.initialOpen.source
      && /tier:/.test(initialOpen.editorStatusLine ?? ""),
      `${E.initialOpen.relPath} opened from ${E.initialOpen.source} (shell.file.open pin + role=tab aria-selected); editor status honest (${J((initialOpen.editorStatusLine ?? "").slice(0, 120))})`);
  }

  let explorerOpen = null;
  if (E.openViaExplorer) {
    const rel = E.openViaExplorer.relPath;
    // the Project tool window is open by default; if a layout pref closed it,
    // the rail toggle (data-testid) is the user path — same as a human.
    const explorerVisible = await evaluate("!!document.querySelector('[data-testid=\"explorer\"]')");
    if (!explorerVisible) {
      await evaluate("document.querySelector('[data-testid=\"rail-project\"]').click()");
      await pollPage("!!document.querySelector('[data-testid=\"explorer\"]')", 15000, "project window open");
    }
    await pollPage(`!!document.querySelector('.explorer-row.explorer-file[data-path=' + ${J(J(rel))} + ']')`,
      30000, `explorer row for ${rel} (hub /fs/list served)`);
    await evaluate(`document.querySelector('.explorer-row.explorer-file[data-path=' + ${J(J(rel))} + ']').click()`);
    explorerOpen = await waitFileOpen(rel, "hub-fs", "explorer click");
    check("file-opens-explorer", explorerOpen.activeTab === rel
      && explorerOpen.openPayload?.source === "hub-fs"
      && /tier:/.test(explorerOpen.editorStatusLine ?? ""),
      `${rel} opened via the REAL explorer flow (role=treeitem click → hub /fs/file → tab active → editor wall mounted)`);
  }

  return { initialOpen, explorerOpen };
}
