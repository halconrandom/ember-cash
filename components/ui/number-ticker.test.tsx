// @vitest-environment jsdom
// Regresión v0.35.1: el Number Ticker quedaba congelado a medio contar
// (Ingresos 7.073.615 en vez de 7.836.663). Sin cuadros de animación (como
// una pestaña en segundo plano), el texto igual tiene que terminar exacto.
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NumberTicker, TICKER_MAX_MS } from "./number-ticker";

const format = (v: number) => String(v);

describe("NumberTicker", () => {
  afterEach(() => vi.useRealTimers());

  it("termina en el valor exacto aunque el resorte no avance", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame"] });
    const { container } = render(<NumberTicker value={7_836_663} format={format} animate />);
    const shown = () => container.querySelectorAll("span[aria-hidden]")[1]?.textContent;
    act(() => vi.advanceTimersByTime(TICKER_MAX_MS + 10));
    expect(shown()).toBe("7836663");
  });

  it("un cambio de valor después salta directo al nuevo número", () => {
    const { container, rerender } = render(
      <NumberTicker value={100} format={format} animate={false} />,
    );
    rerender(<NumberTicker value={7_836_663} format={format} animate={false} />);
    expect(container.querySelectorAll("span[aria-hidden]")[1]?.textContent).toBe("7836663");
  });
});
