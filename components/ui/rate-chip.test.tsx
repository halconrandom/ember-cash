// @vitest-environment jsdom
// Tests del chip de tasa: sus 4 estados (spec §4.9/§4.10) y el ancho conservado.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/test/intl";

import { RateChip } from "./rate-chip";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const props = { rate: "1 USD = 3,174.67 COP", asOf: "Oct 17" };

describe("RateChip", () => {
  it("fresca: la tasa (sin SAMPLE) y un clic abre 'Tasas de hoy'", () => {
    const onOpen = vi.fn();
    render(<RateChip state="fresh" {...props} onOpen={onOpen} />);
    expect(screen.getByText(props.rate)).toBeTruthy();
    expect(screen.queryByText(/sample/i)).toBeNull();
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-state")).toBe("fresh");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("con más pares, muestra '+n'", () => {
    render(<RateChip state="fresh" {...props} more={2} />);
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("vieja: ámbar con 'Stale' y un clic abre 'Tasas de hoy'", () => {
    const onOpen = vi.fn();
    render(<RateChip state="stale" {...props} onOpen={onOpen} />);
    expect(screen.getByText("Stale")).toBeTruthy();
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-state")).toBe("stale");
    expect(button.className).toContain("border-amber");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("actualizando: conserva el ancho que tenía el chip", () => {
    // jsdom no mide: se simula un ResizeObserver que informa 260 px.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb(
            [{ borderBoxSize: [{ inlineSize: 260 }] } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
      },
    );
    const { rerender } = render(<RateChip state="fresh" {...props} />);
    act(() => undefined);
    rerender(<RateChip state="updating" {...props} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Updating rate...");
    expect(status.style.width).toBe("260px");
  });

  it("error: 'Rate unavailable' y Retry llama a refrescar", () => {
    const onRefresh = vi.fn();
    render(<RateChip state="error" {...props} onRefresh={onRefresh} />);
    expect(screen.getByText("Rate unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("error sin tasa previa no muestra números inventados", () => {
    render(<RateChip state="error" />, "es");
    expect(screen.getByText("Tasa no disponible")).toBeTruthy();
    expect(screen.queryByText(/USD =/)).toBeNull();
  });
});
