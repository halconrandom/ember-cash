// @vitest-environment jsdom
// Tests de MoneyAmount: reglas de moneda de la spec (§4.1, §4.2, §4.9).
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Rate } from "@/lib/money/convert";
import { money } from "@/lib/money/money";
import { renderWithIntl as render } from "@/test/intl";

import { MoneyAmount } from "./money-amount";
import { RateProvider, type RateStatus } from "./rate-provider";

// Las Server Actions no se ejecutan en estos tests.
vi.mock("@/lib/money/actions", () => ({ refreshRate: vi.fn(), saveDisplayCurrency: vi.fn() }));

afterEach(cleanup);

const NBSP = " ";
const RATE: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: new Date().toISOString(),
  source: "test",
};

function setup(node: React.ReactElement, display: "COP" | "USD" = "COP", status?: RateStatus) {
  return render(
    <RateProvider
      initialRate={RATE}
      initialDisplayCurrency={display}
      persist={false}
      forcedStatus={status}
    >
      {node}
    </RateProvider>,
  );
}

describe("MoneyAmount", () => {
  it("fila en la misma moneda: solo el importe, sin ≈ ni original", () => {
    const { container } = setup(<MoneyAmount value={money(89900n, "COP")} />);
    expect(container.textContent).toBe(`89,900${NBSP}COP`);
  });

  it("fila en otra moneda: convertido primero (sin ≈) y 'original' debajo", () => {
    const { container } = setup(<MoneyAmount value={money(1599n, "USD")} />);
    expect(container.textContent).toContain(`63,960${NBSP}COP`);
    expect(container.querySelector(".text-footnote")?.textContent).toBe(`original US$${NBSP}15.99`);
    expect(container.textContent).not.toContain("≈");
  });

  it("total: ≈ con la otra moneda", () => {
    const { container } = setup(<MoneyAmount kind="total" value={money(3_360_000n, "COP")} />);
    expect(container.textContent).toContain(`3,360,000${NBSP}COP`);
    expect(container.textContent).toContain(`≈${NBSP}US$${NBSP}840.00`);
  });

  it("actualizando: lo convertido baja al 60 %", () => {
    const { container } = setup(
      <MoneyAmount kind="total" value={money(84000n, "USD")} />,
      "USD",
      "updating",
    );
    expect(container.querySelector(".opacity-60")?.textContent).toBe(`≈${NBSP}3,360,000${NBSP}COP`);
  });

  it("error: el original sigue como principal y lo convertido dice 'rate unavailable'", () => {
    const { container } = setup(<MoneyAmount value={money(1599n, "USD")} />, "COP", "error");
    expect(container.textContent).toContain(`US$${NBSP}15.99`);
    expect(screen.getByText("rate unavailable")).toBeTruthy();
    expect(container.textContent).not.toContain("COP");
  });
});
