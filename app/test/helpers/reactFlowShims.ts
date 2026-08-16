/**
 * SUB200 restructure (wave 2) — the standard React Flow jsdom shims, hoisted
 * VERBATIM from the split suites (the cell's own pattern:
 * packages/graph-view/src/render.dom.test.tsx, credited). React Flow measures
 * real DOM; jsdom has no ResizeObserver/DOMMatrix/offset metrics.
 *
 * Usage in a test file:  beforeAll(installReactFlowShims);
 */

export function installReactFlowShims(): void {
  class ResizeObserverMock {
    callback: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.callback = cb; }
    observe(target: Element) {
      const contentRect = { x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800 };
      this.callback(
        [{ target, contentRect } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;

  class DOMMatrixReadOnlyMock {
    m22: number;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
      this.m22 = scale !== undefined ? +scale : 1;
    }
  }
  (globalThis as Record<string, unknown>).DOMMatrixReadOnly = DOMMatrixReadOnlyMock;

  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { get() { return parseFloat((this as HTMLElement).style.height) || 600; }, configurable: true },
    offsetWidth: { get() { return parseFloat((this as HTMLElement).style.width) || 800; }, configurable: true },
  });
  (SVGElement.prototype as unknown as { getBBox: () => object }).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 });
}
