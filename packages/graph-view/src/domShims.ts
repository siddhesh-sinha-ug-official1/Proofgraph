/**
 * The standard React Flow jsdom shims (it measures real DOM): ResizeObserver,
 * DOMMatrixReadOnly, offsetWidth/offsetHeight, SVG getBBox. Shared by the DOM
 * test files (each calls installReactFlowDomShims() from its own beforeAll) —
 * extracted verbatim from the duplicated per-file blocks (SUB200 restructure).
 * No imports: the boundary census sweeps this file like any other cell file.
 */

export function installReactFlowDomShims(): void {
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
  (SVGElement.prototype as unknown as { getBBox: () => object }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
}
