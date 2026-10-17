// Preparación de Vitest para tests con jsdom: jsdom no trae matchMedia, que
// usan motion (movimiento reducido) y el proveedor de tema.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom no trae IntersectionObserver (lo usa useInView de motion en el Number
// Ticker). Este reemplazo avisa de inmediato que el elemento está a la vista.
if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
  class IntersectionObserverStub {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target, intersectionRatio: 1 } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(window, "IntersectionObserver", { value: IntersectionObserverStub });
  Object.defineProperty(globalThis, "IntersectionObserver", { value: IntersectionObserverStub });
}
