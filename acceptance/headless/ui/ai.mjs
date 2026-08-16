/**
 * Phase 6 of headless_ui.mjs (carved VERBATIM — SUB200 restructure,
 * wave 2): the AI outlet through the DOM (tool window behind the rail).
 */

export async function phaseAi({ evaluate, pollPage, check, E, J, sleep }) {
  let aiAnswer = null;
  if (E.ai) {
    const askVisible = await evaluate("!!document.querySelector('.ai-ask-row button')");
    if (!askVisible) {
      await evaluate("document.querySelector('[data-testid=\\\"rail-ai\\\"]').click()");
      await pollPage("!!document.querySelector('.ai-ask-row button')", 15000,
        "AI tool window open (rail-ai toggle)");
      await sleep(300);
    }
    await evaluate("document.querySelector('.ai-ask-row button').click()");
    await pollPage("!!document.querySelector('.ai-answer') || !!document.querySelector('.ai-panel .banner-error')",
      60000, "AI answer or a named AI error");
    await sleep(500);
    aiAnswer = await evaluate(`(() => ({
      answer: document.querySelector('.ai-answer')?.textContent ?? null,
      error: document.querySelector('.ai-panel .banner-error')?.textContent ?? null,
      badges: [...document.querySelectorAll('.ai-badges .badge')].map(b => b.textContent),
      toolCallHeads: [...document.querySelectorAll('.tool-call-head')].map(t => t.textContent),
    }))()`);
    const answer = aiAnswer.answer ?? "";
    const mustOk = (E.ai.mustContain ?? []).every((s) => answer.includes(s));
    const mustNotOk = !(E.ai.mustNotContainIds ?? []).some((nid) => answer.includes(nid));
    check("ai-honest", aiAnswer.error === null && mustOk && mustNotOk,
      `AI answer honest: contains ${J(E.ai.mustContain ?? [])}, never fabricates ids ` +
      `(${(E.ai.mustNotContainIds ?? []).length} served ids checked absent); got: ${J(answer.slice(0, 200))}`);
    if (E.ai.toolHeadContains) {
      check("ai-tool-exec", aiAnswer.toolCallHeads.some((t) => (t ?? "").includes(E.ai.toolHeadContains)),
        `the ${E.ai.toolHeadContains} tool execution rendered in the DOM (outlet.tool.exec pins served)`);
    }
    // close the AI tool window again: the layout persists per-origin
    // (localStorage) and all three pages share one ephemeral vite origin —
    // an open AI float would otherwise overlap the editor window on the
    // NEXT page and obstruct its Monaco caret click.
    await evaluate("document.querySelector('[data-testid=\\\"rail-ai\\\"]').click()");
    await sleep(200);
  }
  return aiAnswer;
}
